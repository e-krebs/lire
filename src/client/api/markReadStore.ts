export const MARK_READ_SYNC_TAG = "mark-read";

const DB_NAME = "lire-mark-read";
const STORE_NAME = "pending";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const memory = new Map<string, number>();
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

const memoryAll = (): string[] => {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [id, at] of memory) if (at < cutoff) memory.delete(id);
  return [...memory.keys()];
};

export const markReadStore = {
  async add(ids: string[]): Promise<void> {
    const now = Date.now();
    if (persistent()) {
      try {
        await run({
          mode: "readwrite",
          action: (store) => {
            for (const id of ids) store.put(now, id);
            return undefined;
          },
        });
        return;
      } catch {}
    }
    for (const id of ids) memory.set(id, now);
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

  async all(): Promise<string[]> {
    if (persistent()) {
      try {
        const cutoff = Date.now() - MAX_AGE_MS;
        const fresh: string[] = [];
        // One readwrite transaction: the cursor deletes only what it just read as stale, so an
        // entry refreshed after this read cannot be removed.
        await run({
          mode: "readwrite",
          action: (store) => {
            const request = store.openCursor();
            request.onsuccess = () => {
              const cursor = request.result;
              if (!cursor) return;
              if (typeof cursor.value === "number" && cursor.value >= cutoff) {
                const { key } = cursor;
                fresh.push(typeof key === "string" ? key : JSON.stringify(key));
              } else cursor.delete();
              cursor.continue();
            };
            return request;
          },
        });
        return [...new Set([...fresh, ...memoryAll()])];
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
