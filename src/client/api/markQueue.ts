import { ApiError, markEntries } from "client/api/client";
import {
  MARK_SYNC_TAG,
  isRetryable,
  markStore,
  type MarkRow,
  type MarkState,
} from "client/api/markStore";

// NewsBlur asks clients to batch read marks, so marks go upstream at 5 ids or after 10 s, whichever
// comes first, and on `pagehide` as a keepalive request. The caller's cache update stays instant.
/** @public Read by the queue tests. */
export const MARK_BATCH_SIZE = 5;
/** @public Read by the queue tests. */
export const MARK_DELAY_MS = 10_000;

// One per `mark` call: it settles once every id of the call is sent, or cancelled out.
interface Waiter {
  remaining: number;
  resolve: () => void;
  reject: (error: unknown) => void;
}

type Send = (batch: {
  read: string[];
  unread: string[];
  keepalive: boolean;
  userId?: number;
}) => Promise<void>;
type Store = Pick<typeof markStore, "add" | "remove" | "all" | "removeUnchanged" | "clear">;

const statusOf = (error: unknown): number | undefined =>
  error instanceof ApiError ? error.status : undefined;

const syncSupported = (): boolean =>
  import.meta.env.VITE_API_MODE === "real" &&
  "serviceWorker" in navigator &&
  "SyncManager" in window;

let cachedRegistration: ServiceWorkerRegistration | undefined;

const registerSync = (): void => {
  try {
    if (!syncSupported()) return;
    if (cachedRegistration) {
      cachedRegistration.sync.register(MARK_SYNC_TAG).catch(() => {});
      return;
    }
    navigator.serviceWorker.ready
      .then(async (registration) => registration.sync.register(MARK_SYNC_TAG))
      .catch(() => {});
  } catch {}
};

const settleOne = (waiter: Waiter): void => {
  waiter.remaining--;
  if (waiter.remaining === 0) waiter.resolve();
};

// One intent per id, the last mark wins. A queued mark and its opposite cancel out with no request;
// a mark of an id in flight queues behind it, since the sent one has reached the server.
/** @public Built per test; production uses the shared `markQueue`. */
export function createMarkQueue({ send, store = markStore }: { send: Send; store?: Store }) {
  const queued = new Map<string, { state: MarkState; waiters: Waiter[] }>();
  const inFlight = new Map<string, MarkState>();
  // Stored rows whose delivery is unknown: a retryable failure or a replay. A cancel restores them.
  const unsent = new Map<string, MarkState>();
  let sending: Promise<void> | undefined;
  // A timer or the batch size fired while a request was in flight.
  let due = false;
  let dueKeepalive = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Store calls run in order, so a row written after a send is never removed by that send.
  let storeChain: Promise<unknown> = Promise.resolve();
  // Ids marked while a replay reads the store: its snapshot is stale for them.
  const watching = new Set<Set<string>>();
  // Unknown until the page learns the signed-in user. A row written before that stays untagged.
  let user: number | undefined;
  // Bumped by `clear` and by a user change: a send or replay that started earlier skips its store writes.
  let generation = 0;
  let resolveFirstReplay = () => {};
  const firstReplay = new Promise<void>((resolve) => {
    resolveFirstReplay = resolve;
  });

  const tagged = ({ id, state }: { id: string; state: MarkState }): MarkRow =>
    user === undefined ? { id, state } : { id, state, userId: user };

  const inOrder = async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = storeChain.then(operation);
    storeChain = result.catch(() => {});
    return result;
  };

  const arm = (): void => {
    if (queued.size > 0)
      timer ??= setTimeout(() => {
        dispatch();
      }, MARK_DELAY_MS);
  };

  const dispatch = ({ keepalive = false }: { keepalive?: boolean } = {}): void => {
    clearTimeout(timer);
    timer = undefined;
    if (sending) {
      due = true;
      dueKeepalive ||= keepalive;
      return;
    }
    if (queued.size === 0) return;
    due = false;
    dueKeepalive = false;
    const batch = [...queued];
    queued.clear();
    for (const [id, { state }] of batch) inFlight.set(id, state);
    sending = sendBatch({ batch, keepalive });
  };

  const sendBatch = async ({
    batch,
    keepalive,
  }: {
    batch: [string, { state: MarkState; waiters: Waiter[] }][];
    keepalive: boolean;
  }): Promise<void> => {
    const idsOf = (state: MarkState) =>
      batch.filter(([, mark]) => mark.state === state).map(([id]) => id);
    const waiters = batch.flatMap(([, mark]) => mark.waiters);
    // Read before the first await: an account change during the send must not relabel this batch.
    const owner = user;
    const startedIn = generation;
    // A row whose id was marked again holds that newer mark. Read now: `finally` may move those ids
    // to the next batch before the store chain runs.
    const removeSent = (): void => {
      const sent = batch.map(([id]) => id).filter((id) => !queued.has(id));
      void inOrder(async () => store.remove(sent)).catch(() => {});
    };
    try {
      await send({
        read: idsOf("read"),
        unread: idsOf("unread"),
        keepalive,
        ...(owner !== undefined && { userId: owner }),
      });
      if (startedIn !== generation) {
        for (const waiter of waiters) settleOne(waiter);
        return;
      }
      for (const [id] of batch) unsent.delete(id);
      removeSent();
      for (const waiter of waiters) settleOne(waiter);
    } catch (error) {
      if (startedIn !== generation) {
        for (const waiter of waiters) settleOne(waiter);
      } else if (isRetryable(statusOf(error))) {
        for (const [id, { state }] of batch) unsent.set(id, state);
        if (document.visibilityState === "hidden") registerSync();
        for (const waiter of waiters) settleOne(waiter);
      } else {
        for (const [id] of batch) unsent.delete(id);
        removeSent();
        for (const waiter of waiters) waiter.reject(error);
      }
    } finally {
      inFlight.clear();
      sending = undefined;
      if (due || queued.size >= MARK_BATCH_SIZE) dispatch({ keepalive: dueKeepalive });
      else arm();
    }
  };

  // Resolves once the request holding these ids went upstream, or they cancelled out; rejects when
  // that request failed for good.
  const mark = async ({ entryIds, read }: { entryIds: string[]; read: boolean }): Promise<void> => {
    const state: MarkState = read ? "read" : "unread";
    const ids = [...new Set(entryIds)];
    if (ids.length === 0) return;
    const settled = new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { remaining: ids.length, resolve, reject };
      const written: MarkRow[] = [];
      const removed: string[] = [];
      for (const id of ids) {
        for (const marked of watching) marked.add(id);
        const current = queued.get(id);
        if (current?.state === state) {
          current.waiters.push(waiter);
          continue;
        }
        if (current) {
          for (const other of current.waiters) settleOne(other);
          const baseline = inFlight.get(id) ?? unsent.get(id);
          // The server may already hold the queued state, so cancelling it would not undo it.
          if (baseline === current.state) {
            queued.set(id, { state, waiters: [waiter] });
            written.push(tagged({ id, state }));
            continue;
          }
          queued.delete(id);
          if (baseline) written.push(tagged({ id, state: baseline }));
          else removed.push(id);
          settleOne(waiter);
          continue;
        }
        queued.set(id, { state, waiters: [waiter] });
        written.push(tagged({ id, state }));
      }
      if (written.length > 0) void inOrder(async () => store.add(written)).catch(() => {});
      if (removed.length > 0) void inOrder(async () => store.remove(removed)).catch(() => {});
    });
    if (queued.size >= MARK_BATCH_SIZE) dispatch();
    else arm();
    await settled;
  };

  const flush = async ({ keepalive = false }: { keepalive?: boolean } = {}): Promise<void> => {
    await storeChain;
    while (sending || queued.size > 0) {
      dispatch({ keepalive });
      await sending?.catch(() => {});
    }
  };

  // Sends what an earlier session left stored, for the current user. A row of another user goes
  // away unsent; an untagged one is adopted.
  const replay = async (): Promise<void> => {
    const startedIn = generation;
    const marked = new Set<string>();
    watching.add(marked);
    let rows: MarkRow[];
    try {
      rows = await inOrder(async () => store.all()).catch(() => []);
    } finally {
      watching.delete(marked);
    }
    if (startedIn !== generation) return;
    const foreign = rows.filter(({ userId }) => userId !== undefined && userId !== user);
    if (foreign.length > 0)
      void inOrder(async () => store.removeUnchanged(foreign)).catch(() => {});
    const stored = rows.filter(
      (row) =>
        !foreign.includes(row) &&
        !queued.has(row.id) &&
        !inFlight.has(row.id) &&
        !marked.has(row.id),
    );
    if (stored.length === 0) return;
    const adopted: MarkRow[] = [];
    for (const { id, state, userId } of stored) {
      queued.set(id, { state, waiters: [] });
      unsent.set(id, state);
      if (userId === undefined && user !== undefined) adopted.push(tagged({ id, state }));
    }
    if (adopted.length > 0) void inOrder(async () => store.add(adopted)).catch(() => {});
    await flush();
  };

  const dropQueued = (): void => {
    generation++;
    clearTimeout(timer);
    timer = undefined;
    due = false;
    dueKeepalive = false;
    unsent.clear();
    inFlight.clear();
    for (const { waiters } of queued.values()) for (const waiter of waiters) waiter.resolve();
    queued.clear();
  };

  // Marks made before the user was known belong to the first one the page learns. A different user
  // drops the previous one's marks with no request. Resolves once the replay for this user is done.
  const setUser = async ({ userId }: { userId: number }): Promise<void> => {
    if (userId === user) return;
    const previous = user;
    user = userId;
    if (previous === undefined) {
      const rows = new Map<string, MarkState>([...inFlight, ...unsent]);
      for (const [id, { state }] of queued) rows.set(id, state);
      if (rows.size > 0) {
        const adopted = [...rows].map(([id, state]) => tagged({ id, state }));
        void inOrder(async () => store.add(adopted)).catch(() => {});
      }
    } else {
      dropQueued();
      void inOrder(async () => {
        const stored = await store.all();
        await store.removeUnchanged(
          stored.filter((row) => row.userId !== undefined && row.userId !== userId),
        );
      }).catch(() => {});
    }
    try {
      await replay();
    } finally {
      resolveFirstReplay();
    }
  };

  // Sign-out: forgets the user and every stored mark.
  const clear = async (): Promise<void> => {
    dropQueued();
    user = undefined;
    await inOrder(async () => store.clear()).catch(() => {});
  };

  // The status settled without a user: opens the replay gate, and stored rows stay untagged.
  const noUser = (): void => {
    resolveFirstReplay();
  };

  // Tests only: drops what is queued without sending it.
  const reset = (): void => {
    dropQueued();
    user = undefined;
  };

  return {
    mark,
    flush,
    replay,
    reset,
    setUser,
    noUser,
    clear,
    firstReplay,
    currentUser: () => user,
  };
}

export const markQueue = createMarkQueue({
  send: async ({ read, unread, keepalive, userId }) =>
    markEntries({ read, unread, keepalive, userId }),
});

const REPLAY_WAIT_MS = 3000;

export const settleWithin = async ({
  promise,
  ms,
}: {
  promise: Promise<void>;
  ms: number;
}): Promise<void> =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    void promise.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Resolves once the replay for the first known user has sent what an earlier session left stored, or after 3 s if it hangs. */
let whenReplayed: Promise<void> = Promise.resolve();

if (typeof window !== "undefined") {
  const flushOnLeave = () => {
    registerSync();
    void markQueue.flush({ keepalive: true });
  };
  if (syncSupported()) {
    navigator.serviceWorker.ready
      .then((registration) => {
        cachedRegistration = registration;
      })
      .catch(() => {});
  }
  window.addEventListener("pagehide", flushOnLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnLeave();
  });
  window.addEventListener("online", () => {
    if (markQueue.currentUser() !== undefined) void markQueue.replay();
  });
  whenReplayed = settleWithin({ promise: markQueue.firstReplay, ms: REPLAY_WAIT_MS });
}

// A mark still waiting in the batch would come back undone from a fetch. Bounded like the replay,
// so a hanging mark POST never holds the lists.
export const sendQueuedReads = async (): Promise<void> =>
  settleWithin({
    promise: (async () => {
      // Only a real build stores marks across sessions, so only it waits for the user.
      if (import.meta.env.VITE_API_MODE === "real") await whenReplayed;
      await markQueue.flush();
    })().catch(() => {}),
    ms: REPLAY_WAIT_MS,
  });
