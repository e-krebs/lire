import { markRead } from "client/api/client";

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

/** @public Built per test; production uses the shared `markReadQueue`. */
export const createMarkReadQueue = ({ send }: { send: Send }) => {
  let pending: string[] = [];
  let waiters: Waiter[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const take = () => {
    clearTimeout(timer);
    timer = undefined;
    const batch = { entryIds: pending, waiters };
    pending = [];
    waiters = [];
    return batch;
  };

  const flush = async ({ keepalive = false }: { keepalive?: boolean } = {}): Promise<void> => {
    const { entryIds, waiters: settled } = take();
    if (entryIds.length === 0) {
      for (const waiter of settled) waiter.resolve();
      return;
    }
    try {
      await send({ entryIds, keepalive });
      for (const waiter of settled) waiter.resolve();
    } catch (error) {
      for (const waiter of settled) waiter.reject(error);
    }
  };

  // Resolves once the batch holding these ids went upstream, rejects when that call failed.
  const add = async (entryIds: string[]): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      pending = [...new Set([...pending, ...entryIds])];
      waiters.push({ resolve, reject });
      if (pending.length >= MARK_READ_BATCH_SIZE) void flush();
      else timer ??= setTimeout(() => void flush(), MARK_READ_DELAY_MS);
    });

  // A mark unread wins over a read still waiting in the queue.
  const cancel = (entryIds: string[]): void => {
    pending = pending.filter((id) => !entryIds.includes(id));
  };

  // Tests only: drops what is queued without sending it.
  const reset = (): void => {
    for (const waiter of take().waiters) waiter.resolve();
  };

  return { add, cancel, flush, reset };
};

export const markReadQueue = createMarkReadQueue({ send: markRead });

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    void markReadQueue.flush({ keepalive: true });
  });
}
