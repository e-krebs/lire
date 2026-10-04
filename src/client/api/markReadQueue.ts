import { ApiError, markRead } from "client/api/client";
import { MARK_READ_SYNC_TAG, isRetryable, markReadStore } from "client/api/markReadStore";

// NewsBlur asks clients to batch read marks, so they go upstream at 5 ids or after 10 s, whichever
// comes first, and on `pagehide` as a keepalive request. The caller's cache update stays instant.
/** @public Read by the queue tests. */
export const MARK_READ_BATCH_SIZE = 5;
/** @public Read by the queue tests. */
export const MARK_READ_DELAY_MS = 10_000;

interface Waiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

type Send = (batch: { entryIds: string[]; keepalive: boolean }) => Promise<void>;
type Store = Pick<typeof markReadStore, "add" | "remove" | "all">;

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
      cachedRegistration.sync.register(MARK_READ_SYNC_TAG).catch(() => {});
      return;
    }
    navigator.serviceWorker.ready
      .then(async (registration) => registration.sync.register(MARK_READ_SYNC_TAG))
      .catch(() => {});
  } catch {}
};

/** @public Built per test; production uses the shared `markReadQueue`. */
export function createMarkReadQueue({
  send,
  store = markReadStore,
}: {
  send: Send;
  store?: Store;
}) {
  let pending: string[] = [];
  let waiters: Waiter[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Adds whose store write is still in flight: they join `pending` once it completes.
  let writing: { entryIds: string[]; waiter: Waiter }[] = [];
  const writes = new Set<Promise<void>>();
  const inFlight = new Set<string>();
  const sends = new Set<Promise<void>>();
  let replaying = 0;
  const cancelledWhileReplaying = new Set<string>();
  const cancelling = new Set<string>();

  const storeWritten = async (): Promise<void> => {
    await Promise.all(writes);
  };

  const take = () => {
    clearTimeout(timer);
    timer = undefined;
    const batch = { entryIds: pending, waiters };
    pending = [];
    waiters = [];
    return batch;
  };

  const dispatch = async ({ keepalive = false }: { keepalive?: boolean } = {}): Promise<void> => {
    const { entryIds, waiters: settled } = take();
    if (entryIds.length === 0) {
      for (const waiter of settled) waiter.resolve();
      return;
    }
    const sending = sendBatch({ entryIds, settled, keepalive });
    sends.add(sending);
    void sending.finally(() => sends.delete(sending));
    await sending;
  };

  const sendBatch = async ({
    entryIds,
    settled,
    keepalive,
  }: {
    entryIds: string[];
    settled: Waiter[];
    keepalive: boolean;
  }): Promise<void> => {
    for (const id of entryIds) inFlight.add(id);
    try {
      await send({ entryIds, keepalive });
      await store.remove(entryIds).catch(() => {});
      for (const waiter of settled) waiter.resolve();
    } catch (error) {
      if (isRetryable(statusOf(error))) {
        if (document.visibilityState === "hidden") registerSync();
        for (const waiter of settled) waiter.resolve();
        return;
      }
      await store.remove(entryIds).catch(() => {});
      for (const waiter of settled) waiter.reject(error);
    } finally {
      for (const id of entryIds) inFlight.delete(id);
    }
  };

  const flush = async ({ keepalive = false }: { keepalive?: boolean } = {}): Promise<void> => {
    await storeWritten();
    await dispatch({ keepalive });
    // A batch dispatched earlier may still be on the wire: wait for it too.
    await Promise.allSettled(sends);
  };

  // Resolves once the batch holding these ids went upstream, rejects when that call failed. The
  // batch is scheduled after the store write, so a cancel meanwhile still finds the ids.
  const add = async (entryIds: string[]): Promise<void> => {
    const group = { entryIds, waiter: { resolve: () => {}, reject: (_error: unknown) => {} } };
    const settled = new Promise<void>((resolve, reject) => {
      group.waiter = { resolve, reject };
    });
    writing.push(group);
    const write = store.add(entryIds).catch(() => {});
    writes.add(write);
    void write.then(() => {
      writes.delete(write);
      if (!writing.includes(group)) return;
      writing = writing.filter((item) => item !== group);
      pending = [...new Set([...pending, ...group.entryIds])];
      waiters.push(group.waiter);
      if (pending.length >= MARK_READ_BATCH_SIZE) void dispatch();
      else timer ??= setTimeout(() => void dispatch(), MARK_READ_DELAY_MS);
    });
    await settled;
  };

  // A mark unread wins over a read still waiting in the queue, or still being written.
  const cancel = async (entryIds: string[]): Promise<void> => {
    const dropped = new Set(entryIds);
    for (const id of entryIds) cancelling.add(id);
    if (replaying > 0) for (const id of entryIds) cancelledWhileReplaying.add(id);
    pending = pending.filter((id) => !dropped.has(id));
    for (const group of writing) group.entryIds = group.entryIds.filter((id) => !dropped.has(id));
    await storeWritten();
    await store.remove(entryIds).catch(() => {});
    for (const id of entryIds) cancelling.delete(id);
  };

  // Sends what an earlier session left stored. No caller waits on it, so a failure stays silent.
  const replay = async (): Promise<void> => {
    // Two replays (module start, `online`) can overlap while the store still holds sent ids.
    replaying++;
    let stored: string[];
    try {
      const all = await store.all().catch(() => [] as string[]);
      const known = new Set([
        ...pending,
        ...inFlight,
        ...writing.flatMap((group) => group.entryIds),
        ...cancelledWhileReplaying,
        ...cancelling,
      ]);
      stored = all.filter((id) => !known.has(id));
    } finally {
      replaying--;
      if (replaying === 0) cancelledWhileReplaying.clear();
    }
    if (stored.length === 0) return;
    pending = [...new Set([...pending, ...stored])];
    await flush();
  };

  // Tests only: drops what is queued without sending it.
  const reset = (): void => {
    for (const { waiter } of writing) waiter.resolve();
    writing = [];
    for (const waiter of take().waiters) waiter.resolve();
  };

  return { add, cancel, flush, replay, reset };
}

export const markReadQueue = createMarkReadQueue({ send: markRead });

const REPLAY_WAIT_MS = 3000;

const settleWithin = async ({
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

/** Resolves once the startup replay has sent what an earlier session left stored, or after 3 s if it hangs. */
export let whenReplayed: Promise<void> = Promise.resolve();

if (typeof window !== "undefined") {
  const flushOnLeave = () => {
    registerSync();
    void markReadQueue.flush({ keepalive: true });
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
  window.addEventListener("online", () => void markReadQueue.replay());
  whenReplayed = settleWithin({
    promise: markReadQueue.replay().catch(() => {}),
    ms: REPLAY_WAIT_MS,
  });
}
