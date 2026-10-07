export const MARK_SYNC_TAG = "mark-read";

const DB_NAME = "lire-mark-read";
const STORE_NAME = "pending";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type MarkState = "read" | "unread";
export interface MarkRow {
  id: string;
  state: MarkState;
}
interface StoredMark {
  state: MarkState;
  at: number;
}

const memory = new Map<string, StoredMark>();
let opening: Promise<IDBDatabase> | undefined;

export const isRetryable = (status: number | undefined): boolean =>
  status === undefined ||
  status === 401 ||
  status === 403 ||
  status === 408 ||
  status === 429 ||
  status >= 500;

const persistent = () => import.meta.env.VITE_API_MODE === "real";

const open = async (): Promise<IDBDatabase> => {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        opening = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("indexedDB open failed"));
    };
  }).catch((error: unknown) => {
    opening = undefined;
    throw error;
  });
  return opening;
};

const run = async <T = undefined>({
  mode,
  action,
}: {
  mode: IDBTransactionMode;
  action: (store: IDBObjectStore) => IDBRequest<T> | undefined;
}): Promise<T | undefined> => {
  const db = await open();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = action(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => {
      resolve(request?.result);
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error("indexedDB transaction failed"));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error("indexedDB transaction aborted"));
    };
  });
};

// A row from before unreads were stored is a bare timestamp: it was a read.
const parse = (value: unknown): StoredMark | undefined => {
  if (typeof value === "number") return { state: "read", at: value };
  if (typeof value !== "object" || value === null) return undefined;
  const { state, at } = value as Partial<StoredMark>;
  return (state === "read" || state === "unread") && typeof at === "number"
    ? { state, at }
    : undefined;
};

const memoryAll = (): MarkRow[] => {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [id, { at }] of memory) if (at < cutoff) memory.delete(id);
  return [...memory].map(([id, { state }]) => ({ id, state }));
};

export const markStore = {
  async add(rows: MarkRow[]): Promise<void> {
    const at = Date.now();
    if (persistent()) {
      try {
        await run({
          mode: "readwrite",
          action: (store) => {
            for (const { id, state } of rows) store.put({ state, at } satisfies StoredMark, id);
            return undefined;
          },
        });
        return;
      } catch {}
    }
    for (const { id, state } of rows) memory.set(id, { state, at });
  },

  async remove(ids: string[]): Promise<void> {
    for (const id of ids) memory.delete(id);
    if (!persistent()) return;
    try {
      await run({
        mode: "readwrite",
        action: (store) => {
          for (const id of ids) store.delete(id);
          return undefined;
        },
      });
    } catch {}
  },

  // Deletes a row only if it still holds the state given, so a mark written since the caller read it
  // survives. The get and the delete share one transaction.
  async removeUnchanged(rows: MarkRow[]): Promise<void> {
    for (const { id, state } of rows) if (memory.get(id)?.state === state) memory.delete(id);
    if (!persistent()) return;
    try {
      await run({
        mode: "readwrite",
        action: (store) => {
          for (const { id, state } of rows) {
            const request = store.get(id);
            request.onsuccess = () => {
              if (parse(request.result)?.state === state) store.delete(id);
            };
          }
          return undefined;
        },
      });
    } catch {}
  },

  async all(): Promise<MarkRow[]> {
    if (persistent()) {
      try {
        const cutoff = Date.now() - MAX_AGE_MS;
        const fresh = new Map<string, MarkState>();
        // One readwrite transaction: the cursor deletes only what it just read as stale, so an
        // entry refreshed after this read cannot be removed.
        await run({
          mode: "readwrite",
          action: (store) => {
            const request = store.openCursor();
            request.onsuccess = () => {
              const cursor = request.result;
              if (!cursor) return;
              const mark = parse(cursor.value);
              if (mark && mark.at >= cutoff) {
                const { key } = cursor;
                fresh.set(typeof key === "string" ? key : JSON.stringify(key), mark.state);
              } else cursor.delete();
              cursor.continue();
            };
            return request;
          },
        });
        for (const { id, state } of memoryAll()) if (!fresh.has(id)) fresh.set(id, state);
        return [...fresh].map(([id, state]) => ({ id, state }));
      } catch {}
    }
    return memoryAll();
  },

  async reset(): Promise<void> {
    const pending = opening;
    opening = undefined;
    memory.clear();
    if (pending) {
      try {
        (await pending).close();
      } catch {}
    }
  },
};
