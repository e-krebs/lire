import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "test/msw";
import { ApiError } from "../client";
import {
  createMarkReadQueue,
  MARK_READ_BATCH_SIZE,
  MARK_READ_DELAY_MS,
  markReadQueue,
  whenReplayed,
} from "../markReadQueue";
import { markReadStore } from "../markReadStore";

const setup = ({ fail = false }: { fail?: boolean } = {}) => {
  const sent: { entryIds: string[]; keepalive: boolean }[] = [];
  const queue = createMarkReadQueue({
    send: async (batch) => {
      sent.push(batch);
      return fail
        ? Promise.reject(new ApiError({ status: 400, code: "http", message: "boom" }))
        : Promise.resolve();
    },
  });
  return { queue, sent };
};

const fakeStore = (initial: string[] = []) => {
  const stored = new Set(initial);
  return {
    stored,
    add: vi.fn<(added: string[]) => Promise<void>>(async (added) => {
      await Promise.resolve();
      for (const id of added) stored.add(id);
    }),
    remove: vi.fn<(removed: string[]) => Promise<void>>(async (removed) => {
      await Promise.resolve();
      for (const id of removed) stored.delete(id);
    }),
    all: vi.fn<() => Promise<string[]>>(async () => {
      await Promise.resolve();
      return [...stored];
    }),
  };
};

const stubSync = () => {
  const register = vi.fn<(tag: string) => Promise<void>>(async () => {
    await Promise.resolve();
  });
  vi.stubEnv("VITE_API_MODE", "real");
  vi.stubGlobal("SyncManager", class {});
  vi.stubGlobal(
    "navigator",
    Object.create(navigator, {
      serviceWorker: { value: { ready: Promise.resolve({ sync: { register } }) } },
    }),
  );
  return register;
};

const stubVisibility = (state: DocumentVisibilityState): void => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
};

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const stored = async (id: string): Promise<void> => {
  await vi.waitFor(async () => {
    expect(await markReadStore.all()).toContain(id);
  });
};

const ids = (count: number): string[] => Array.from({ length: count }, (_, i) => `101:${i}`);

describe("markReadQueue", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("sends at once when the batch fills", async () => {
    const { queue, sent } = setup();

    void queue.add(ids(MARK_READ_BATCH_SIZE - 1));
    await settle();
    expect(sent).toEqual([]);
    await queue.add(["102:a", "102:a"]);

    expect(sent).toEqual([{ entryIds: [...ids(4), "102:a"], keepalive: false }]);
  });

  it("sends a partial batch after the delay", async () => {
    vi.useFakeTimers();
    const { queue, sent } = setup();

    const settled = queue.add(["101:a"]);
    await vi.advanceTimersByTimeAsync(MARK_READ_DELAY_MS - 1);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await settled;

    expect(sent).toEqual([{ entryIds: ["101:a"], keepalive: false }]);
  });

  it("flushes on demand as keepalive, and resolves an empty flush without sending", async () => {
    const { queue, sent } = setup();

    const settled = queue.add(["101:a"]);
    await settle();
    await queue.flush({ keepalive: true });
    await settled;
    await queue.flush();

    expect(sent).toEqual([{ entryIds: ["101:a"], keepalive: true }]);
  });

  it("waits for a send already in flight when the batch to flush is empty", async () => {
    let release = () => {};
    let done = false;
    const queue = createMarkReadQueue({
      send: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });

    const settled = queue.add(ids(MARK_READ_BATCH_SIZE));
    await settle();
    const flushed = queue.flush().then(() => {
      done = true;
    });
    await settle();
    expect(done).toBe(false);
    release();
    await flushed;
    await settled;

    expect(done).toBe(true);
  });

  it("exposes the startup replay as a settled promise", async () => {
    await expect(whenReplayed).resolves.toBeUndefined();
  });

  it("stops waiting for a hung replay after the cap", async () => {
    vi.stubEnv("VITE_API_MODE", "real");
    server.use(http.post("/api/entries/read", async () => new Promise<never>(() => {})));
    // The fresh module must not leave its page listeners behind for the other tests.
    vi.spyOn(window, "addEventListener").mockImplementation(() => {});
    vi.spyOn(document, "addEventListener").mockImplementation(() => {});
    vi.resetModules();
    const fresh = await import("../markReadStore");
    await fresh.markReadStore.add(["101:hung"]);
    vi.useFakeTimers();
    try {
      const { whenReplayed: hungReplay } = await import("../markReadQueue");
      let settled = false;
      void hungReplay.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(2999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.resetModules();
    }
  });

  it("drops a cancelled id from the waiting batch", async () => {
    const { queue, sent } = setup();

    const settled = queue.add(["101:a", "101:b"]);
    await settle();
    await queue.cancel(["101:a"]);
    await queue.flush();
    await settled;

    expect(sent).toEqual([{ entryIds: ["101:b"], keepalive: false }]);
  });

  it("drops an id cancelled while its store write is still in flight", async () => {
    const store = fakeStore();
    const sent: string[][] = [];
    const queue = createMarkReadQueue({
      send: async ({ entryIds }) => {
        sent.push(entryIds);
        await Promise.resolve();
      },
      store,
    });

    const settled = queue.add(["101:a"]);
    await queue.cancel(["101:a"]);
    await queue.flush();
    await settled;

    expect(sent).toEqual([]);
    expect(store.stored.size).toBe(0);
  });

  it("resolves a batch emptied by cancel without sending", async () => {
    const { queue, sent } = setup();

    const settled = queue.add(["101:a"]);
    await settle();
    await queue.cancel(["101:a"]);
    await queue.flush();

    await expect(settled).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });

  it("rejects every waiter of a failed batch", async () => {
    const { queue } = setup({ fail: true });

    const first = queue.add(["101:a"]);
    const second = queue.add(["101:b"]);
    const outcomes = Promise.allSettled([first, second]);
    await settle();
    void queue.flush();
    await outcomes;

    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");
  });

  it("drops what waits on reset", async () => {
    const { queue, sent } = setup();

    const settled = queue.add(["101:a"]);
    await settle();
    queue.reset();

    await expect(settled).resolves.toBeUndefined();
    await queue.flush();
    expect(sent).toEqual([]);
  });

  it("flushes the shared queue upstream on pagehide", async () => {
    vi.stubEnv("VITE_API_MODE", "real");
    const seen: unknown[] = [];
    server.use(
      http.post("/api/entries/read", async ({ request }) => {
        seen.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const settled = markReadQueue.add(["101:a"]);
    await stored("101:a");
    window.dispatchEvent(new Event("pagehide"));
    await settled;

    expect(seen).toEqual([{ entryIds: ["101:a"] }]);
  });

  describe("when a store is injected", () => {
    const withStore = ({ initial = [], error }: { initial?: string[]; error?: unknown } = {}) => {
      const store = fakeStore(initial);
      const sent: { entryIds: string[]; keepalive: boolean }[] = [];
      const queue = createMarkReadQueue({
        send: async (batch) => {
          await Promise.resolve();
          sent.push(batch);
          if (error) throw error;
        },
        store,
      });
      return { queue, store, sent };
    };

    it("persists the ids before the flush and removes them once sent", async () => {
      const { queue, store, sent } = withStore();

      const settled = queue.add(["101:a"]);
      await settle();
      expect(sent).toEqual([]);
      await queue.flush();
      await settled;

      expect(store.stored.size).toBe(0);
    });

    it("adds even when the store fails", async () => {
      const { queue, store, sent } = withStore();
      store.add.mockReturnValueOnce(Promise.reject(new Error("quota")));

      const settled = queue.add(["101:a"]);
      await settle();
      await queue.flush();
      await settled;

      expect(sent).toHaveLength(1);
    });

    it("keeps the ids and resolves the waiter on a retryable failure", async () => {
      const { queue, store } = withStore({
        error: new ApiError({ status: 503, code: "http" }),
      });

      const settled = queue.add(["101:a"]);
      await settle();
      await queue.flush();

      await expect(settled).resolves.toBeUndefined();
      expect(store.stored.has("101:a")).toBe(true);
    });

    it("treats a network error as retryable", async () => {
      const { queue, store } = withStore({ error: new TypeError("Failed to fetch") });

      const settled = queue.add(["101:a"]);
      await settle();
      await queue.flush();

      await expect(settled).resolves.toBeUndefined();
      expect(store.stored.has("101:a")).toBe(true);
    });

    it("removes the ids and rejects the waiter on a non-retryable failure", async () => {
      const { queue, store } = withStore({
        error: new ApiError({ status: 400, code: "http" }),
      });

      const outcome = queue.add(["101:a"]).then(
        () => undefined,
        (rejection: unknown) => rejection,
      );
      await settle();
      await queue.flush();

      expect(await outcome).toMatchObject({ status: 400 });
      expect(store.stored.size).toBe(0);
    });

    it("removes a cancelled id from the store", async () => {
      const { queue, store } = withStore({ initial: ["101:a", "101:b"] });

      await queue.cancel(["101:a"]);

      expect([...store.stored]).toEqual(["101:b"]);
    });

    it("does not replay an id whose cancel has not finished removing it", async () => {
      const { queue, store, sent } = withStore();
      let release = () => {};
      store.remove.mockImplementationOnce(async (removed) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        for (const id of removed) store.stored.delete(id);
      });

      void queue.add(["101:a"]);
      const cancelled = queue.cancel(["101:a"]);
      await settle();
      expect(store.stored.has("101:a")).toBe(true);
      await queue.replay();
      release();
      await cancelled;

      expect(sent).toEqual([]);
    });

    it("replays the stored ids", async () => {
      const { queue, store, sent } = withStore({ initial: ["101:a", "101:b"] });

      await queue.replay();

      expect(sent).toEqual([{ entryIds: ["101:a", "101:b"], keepalive: false }]);
      expect(store.stored.size).toBe(0);
    });

    it("does not send an id twice when replays overlap", async () => {
      const store = fakeStore(["101:a"]);
      const sent: string[][] = [];
      const queue = createMarkReadQueue({
        send: async ({ entryIds }) => {
          sent.push(entryIds);
          await new Promise((resolve) => setTimeout(resolve, 5));
        },
        store,
      });

      const first = queue.replay();
      await new Promise((resolve) => setTimeout(resolve, 1));
      await Promise.all([first, queue.replay()]);

      expect(sent).toEqual([["101:a"]]);
    });

    it("sends nothing on replay when the store is empty", async () => {
      const { queue, sent } = withStore();

      await queue.replay();

      expect(sent).toEqual([]);
    });

    it("raises nothing when a replayed send fails", async () => {
      const { queue, store } = withStore({
        initial: ["101:a"],
        error: new ApiError({ status: 400, code: "http" }),
      });
      const unhandled = vi.fn<(reason: unknown) => void>();
      process.on("unhandledRejection", unhandled);

      await expect(queue.replay()).resolves.toBeUndefined();
      await settle();

      process.off("unhandledRejection", unhandled);
      expect(unhandled).not.toHaveBeenCalled();
      expect(store.stored.size).toBe(0);
    });

    it("settles the waiter when the store cannot remove the ids after a send", async () => {
      const { queue, store } = withStore();
      store.remove.mockRejectedValue(new Error("quota"));

      const settled = queue.add(["101:a"]);
      await settle();
      await queue.flush();

      await expect(settled).resolves.toBeUndefined();
    });

    it("still rejects the waiter when the store cannot remove the ids of a failed send", async () => {
      const { queue, store } = withStore({ error: new ApiError({ status: 400, code: "http" }) });
      store.remove.mockRejectedValue(new Error("quota"));

      const outcome = queue.add(["101:a"]).then(
        () => undefined,
        (rejection: unknown) => rejection,
      );
      await settle();
      await queue.flush();

      expect(await outcome).toMatchObject({ status: 400 });
    });

    it("cancels even when the store cannot remove the ids", async () => {
      const { queue, store } = withStore({ initial: ["101:a"] });
      store.remove.mockRejectedValue(new Error("quota"));

      await expect(queue.cancel(["101:a"])).resolves.toBeUndefined();
    });

    it("sends nothing on replay when the store cannot be read", async () => {
      const { queue, store, sent } = withStore();
      store.all.mockRejectedValue(new Error("blocked"));

      await queue.replay();

      expect(sent).toEqual([]);
    });

    it("leaves ids whose store write is in flight to their own batch on replay", async () => {
      const { queue, store, sent } = withStore();

      const settled = queue.add(["101:a"]);
      store.all.mockResolvedValueOnce(["101:a"]);
      await queue.replay();
      await queue.flush();
      await settled;

      expect(sent).toEqual([{ entryIds: ["101:a"], keepalive: false }]);
    });

    it("registers the sync tag after a retryable failure on a hidden page, not on add", async () => {
      const register = stubSync();
      stubVisibility("hidden");
      const { queue } = withStore({ error: new ApiError({ status: 503, code: "http" }) });

      const settled = queue.add(["101:a"]);
      await settle();
      expect(register).not.toHaveBeenCalled();
      await queue.flush();
      await settled;
      await settle();

      expect(register).toHaveBeenCalledWith("mark-read");
    });

    it("does not register the sync tag after a retryable failure on a visible page", async () => {
      const register = stubSync();
      stubVisibility("visible");
      const { queue } = withStore({ error: new ApiError({ status: 503, code: "http" }) });

      const settled = queue.add(["101:a"]);
      await settle();
      await queue.flush();
      await settled;
      await settle();

      expect(register).not.toHaveBeenCalled();
    });

    it("keeps an id cancelled while a replay reads the store", async () => {
      const { queue, store, sent } = withStore({ initial: ["101:a", "101:b"] });
      const read = store.all.getMockImplementation();
      store.all.mockImplementationOnce(async () => {
        const result = (await read?.()) ?? [];
        await queue.cancel(["101:a"]);
        return result;
      });

      await queue.replay();

      expect(sent).toEqual([{ entryIds: ["101:b"], keepalive: false }]);
    });
  });

  describe("when the page leaves or reconnects", () => {
    it("flushes with keepalive and registers the sync tag when the page hides", async () => {
      const register = stubSync();
      const fetchStub = vi.fn<typeof fetch>(async () => {
        await Promise.resolve();
        return new Response(null, { status: 204 });
      });
      vi.stubGlobal("fetch", fetchStub);
      stubVisibility("hidden");

      const settled = markReadQueue.add(["101:a"]);
      await stored("101:a");
      expect(register).not.toHaveBeenCalled();
      document.dispatchEvent(new Event("visibilitychange"));
      await settled;
      await settle();

      const init = fetchStub.mock.calls[0]?.[1];
      expect(init?.keepalive).toBe(true);
      expect(register).toHaveBeenCalledWith("mark-read");
    });

    it("registers the sync tag before the keepalive flush settles", async () => {
      const register = stubSync();
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async () => new Promise<Response>(() => {})),
      );
      stubVisibility("hidden");

      void markReadQueue.add(["101:b"]);
      await stored("101:b");
      window.dispatchEvent(new Event("pagehide"));
      await settle();

      expect(register).toHaveBeenCalledWith("mark-read");
    });

    it("keeps the batch queued when the page becomes visible", async () => {
      const fetchStub = vi.fn<typeof fetch>(async () => {
        await Promise.resolve();
        return new Response(null, { status: 204 });
      });
      vi.stubGlobal("fetch", fetchStub);
      stubVisibility("visible");

      void markReadQueue.add(["101:a"]);
      await stored("101:a");
      document.dispatchEvent(new Event("visibilitychange"));
      await settle();

      expect(fetchStub).not.toHaveBeenCalled();
    });

    it("replays the stored ids when the browser goes online", async () => {
      vi.stubEnv("VITE_API_MODE", "real");
      const seen: unknown[] = [];
      server.use(
        http.post("/api/entries/read", async ({ request }) => {
          seen.push(await request.json());
          return new HttpResponse(null, { status: 204 });
        }),
      );
      await markReadStore.add(["101:z"]);

      window.dispatchEvent(new Event("online"));

      await vi.waitFor(() => {
        expect(seen).toEqual([{ entryIds: ["101:z"] }]);
      });
    });
  });
});
