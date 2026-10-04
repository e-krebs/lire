import { describe, expect, it, vi } from "vitest";
import { isRetryable, markReadStore } from "../markReadStore";

describe("markReadStore", () => {
  describe("when the mode is real", () => {
    const real = () => {
      vi.stubEnv("VITE_API_MODE", "real");
    };

    it("round-trips add, all and remove", async () => {
      real();

      await markReadStore.add(["101:a", "101:b"]);
      expect([...(await markReadStore.all())].sort()).toEqual(["101:a", "101:b"]);
      await markReadStore.remove(["101:a"]);

      expect(await markReadStore.all()).toEqual(["101:b"]);
    });

    it("keeps one entry when an id is added twice", async () => {
      real();

      await markReadStore.add(["101:a"]);
      await markReadStore.add(["101:a"]);
      await markReadStore.remove(["101:z"]);

      expect(await markReadStore.all()).toEqual(["101:a"]);
    });

    it("survives a reset of the connection", async () => {
      real();

      await markReadStore.add(["101:a"]);
      await markReadStore.reset();

      expect(await markReadStore.all()).toEqual(["101:a"]);
    });

    it("drops ids older than 24 hours", async () => {
      real();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      await markReadStore.add(["101:old"]);
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
      await markReadStore.add(["101:new"]);
      vi.setSystemTime(new Date("2026-01-02T00:00:01Z"));

      expect(await markReadStore.all()).toEqual(["101:new"]);
      expect(await markReadStore.all()).toEqual(["101:new"]);
    });

    it("falls back to memory when indexedDB.open throws, then recovers", async () => {
      real();
      vi.stubGlobal("indexedDB", {
        open: () => {
          throw new Error("blocked");
        },
      });

      await markReadStore.add(["101:a"]);
      expect(await markReadStore.all()).toEqual(["101:a"]);
      vi.unstubAllGlobals();
      await markReadStore.add(["101:b"]);

      expect([...(await markReadStore.all())].sort()).toEqual(["101:a", "101:b"]);
    });

    it("reads keys and values in a single transaction", async () => {
      real();
      await markReadStore.add(["101:a", "101:b"]);
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
        await markReadStore.all();
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

      await markReadStore.add(["101:a"]);
      expect(await markReadStore.all()).toEqual(["101:a"]);
      await markReadStore.remove(["101:a"]);

      expect(await markReadStore.all()).toEqual([]);
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
