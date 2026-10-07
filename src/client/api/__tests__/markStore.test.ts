import { describe, expect, it, vi } from "vitest";
import { isRetryable, markStore, type MarkRow, type MarkState } from "../markStore";

const row = (id: string, state: MarkState = "read"): MarkRow => ({ id, state });
const sorted = (rows: MarkRow[]): MarkRow[] => [...rows].sort((a, b) => a.id.localeCompare(b.id));

describe("markStore", () => {
  describe("when the mode is real", () => {
    const real = () => {
      vi.stubEnv("VITE_API_MODE", "real");
    };

    it("round-trips add, all and remove", async () => {
      real();

      await markStore.add([row("101:a"), row("101:b", "unread")]);
      expect(sorted(await markStore.all())).toEqual([row("101:a"), row("101:b", "unread")]);
      await markStore.remove(["101:a"]);

      expect(await markStore.all()).toEqual([row("101:b", "unread")]);
    });

    it("keeps one entry when an id is added twice", async () => {
      real();

      await markStore.add([row("101:a")]);
      await markStore.add([row("101:a", "unread")]);
      await markStore.remove(["101:z"]);

      expect(await markStore.all()).toEqual([row("101:a", "unread")]);
    });

    it("reads an old row, a bare timestamp, as a read", async () => {
      real();
      await markStore.add([row("101:new", "unread")]);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("lire-mark-read", 1);
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(request.error ?? new Error("open failed"));
        };
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("pending", "readwrite");
        tx.objectStore("pending").put(Date.now(), "101:old");
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error("put failed"));
        };
      });
      db.close();

      expect(sorted(await markStore.all())).toEqual([row("101:new", "unread"), row("101:old")]);
    });

    it("removes only the rows that still hold the given state", async () => {
      real();
      await markStore.add([row("101:a"), row("101:b")]);
      await markStore.add([row("101:b", "unread")]);

      await markStore.removeUnchanged([row("101:a"), row("101:b"), row("101:z")]);

      expect(await markStore.all()).toEqual([row("101:b", "unread")]);
    });

    it("survives a reset of the connection", async () => {
      real();

      await markStore.add([row("101:a")]);
      await markStore.reset();

      expect(await markStore.all()).toEqual([row("101:a")]);
    });

    it("drops ids older than 24 hours", async () => {
      real();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      await markStore.add([row("101:old")]);
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
      await markStore.add([row("101:new")]);
      vi.setSystemTime(new Date("2026-01-02T00:00:01Z"));

      expect(await markStore.all()).toEqual([row("101:new")]);
      expect(await markStore.all()).toEqual([row("101:new")]);
    });

    it("falls back to memory when indexedDB.open throws, then recovers", async () => {
      real();
      vi.stubGlobal("indexedDB", {
        open: () => {
          throw new Error("blocked");
        },
      });

      await markStore.add([row("101:a")]);
      expect(await markStore.all()).toEqual([row("101:a")]);
      vi.unstubAllGlobals();
      await markStore.add([row("101:b")]);

      expect(sorted(await markStore.all())).toEqual([row("101:a"), row("101:b")]);
    });

    it("reads keys and values in a single transaction", async () => {
      real();
      await markStore.add([row("101:a"), row("101:b")]);
      const original: IDBDatabase["transaction"] = Reflect.get(
        IDBDatabase.prototype,
        "transaction",
      );
      let count = 0;
      IDBDatabase.prototype.transaction = function (
        ...args: Parameters<typeof original>
      ): IDBTransaction {
        count++;
        return original.apply(this, args);
      };

      try {
        await markStore.all();
      } finally {
        IDBDatabase.prototype.transaction = original;
      }

      expect(count).toBe(1);
    });
  });

  describe("when the mode is mock", () => {
    it("stays in memory and never opens a database", async () => {
      vi.stubEnv("VITE_API_MODE", "mock");
      const open = vi.fn<() => never>(() => {
        throw new Error("opened");
      });
      vi.stubGlobal("indexedDB", { open });

      await markStore.add([row("101:a")]);
      expect(await markStore.all()).toEqual([row("101:a")]);
      await markStore.remove(["101:a"]);

      expect(await markStore.all()).toEqual([]);
      expect(open).not.toHaveBeenCalled();
    });
  });

  describe("when checking whether a status is retryable", () => {
    it.each([undefined, 401, 403, 408, 429, 500, 503])("retries %s", (status) => {
      expect(isRetryable(status)).toBe(true);
    });

    it.each([400, 404, 422])("drops %s", (status) => {
      expect(isRetryable(status)).toBe(false);
    });
  });
});
