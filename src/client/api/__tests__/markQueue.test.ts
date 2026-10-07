import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "test/msw";
import { ApiError } from "../client";
import {
  createMarkQueue,
  MARK_BATCH_SIZE,
  MARK_DELAY_MS,
  markQueue,
  sendQueuedReads,
} from "../markQueue";
import { markStore, type MarkRow, type MarkState } from "../markStore";

interface Batch {
  read: string[];
  unread: string[];
  keepalive: boolean;
}

const setup = ({ fail = false }: { fail?: boolean } = {}) => {
  const sent: Batch[] = [];
  const queue = createMarkQueue({
    send: async (batch) => {
      sent.push(batch);
      return fail
        ? Promise.reject(new ApiError({ status: 400, code: "http", message: "boom" }))
        : Promise.resolve();
    },
  });
  return { queue, sent };
};

const fakeStore = (initial: MarkRow[] = []) => {
  const stored = new Map<string, MarkState>(initial.map(({ id, state }) => [id, state]));
  return {
    stored,
    add: vi.fn<(rows: MarkRow[]) => Promise<void>>(async (rows) => {
      await Promise.resolve();
      for (const { id, state } of rows) stored.set(id, state);
    }),
    remove: vi.fn<(removed: string[]) => Promise<void>>(async (removed) => {
      await Promise.resolve();
      for (const id of removed) stored.delete(id);
    }),
    all: vi.fn<() => Promise<MarkRow[]>>(async () => {
      await Promise.resolve();
      return [...stored].map(([id, state]) => ({ id, state }));
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
    expect((await markStore.all()).map((row) => row.id)).toContain(id);
  });
};

const ids = (count: number): string[] => Array.from({ length: count }, (_, i) => `101:${i}`);

describe("markQueue", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("sends at once when the batch fills", async () => {
    const { queue, sent } = setup();

    void queue.mark({ entryIds: ids(MARK_BATCH_SIZE - 1), read: true });
    await settle();
    expect(sent).toEqual([]);
    await queue.mark({ entryIds: ["102:a", "102:a"], read: true });

    expect(sent).toEqual([{ read: [...ids(4), "102:a"], unread: [], keepalive: false }]);
  });

  it("sends a partial batch after the delay", async () => {
    vi.useFakeTimers();
    const { queue, sent } = setup();

    const settled = queue.mark({ entryIds: ["101:a"], read: true });
    await vi.advanceTimersByTimeAsync(MARK_DELAY_MS - 1);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await settled;

    expect(sent).toEqual([{ read: ["101:a"], unread: [], keepalive: false }]);
  });

  it("flushes on demand as keepalive, and resolves an empty flush without sending", async () => {
    const { queue, sent } = setup();

    const settled = queue.mark({ entryIds: ["101:a"], read: true });
    await settle();
    await queue.flush({ keepalive: true });
    await settled;
    await queue.flush();

    expect(sent).toEqual([{ read: ["101:a"], unread: [], keepalive: true }]);
  });

  it("waits for a send already in flight when the batch to flush is empty", async () => {
    let release = () => {};
    let done = false;
    const queue = createMarkQueue({
      send: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });

    const settled = queue.mark({ entryIds: ids(MARK_BATCH_SIZE), read: true });
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

  it("settles the queued reads send", async () => {
    await expect(sendQueuedReads()).resolves.toBeUndefined();
  });

  it("stops waiting for a hung replay after the cap", async () => {
    vi.stubEnv("VITE_API_MODE", "real");
    server.use(http.post("/api/entries/mark", async () => new Promise<never>(() => {})));
    // The fresh module must not leave its page listeners behind for the other tests.
    vi.spyOn(window, "addEventListener").mockImplementation(() => {});
    vi.spyOn(document, "addEventListener").mockImplementation(() => {});
    vi.resetModules();
    const fresh = await import("../markStore");
    await fresh.markStore.add([{ id: "101:hung", state: "read" }]);
    vi.useFakeTimers();
    try {
      const { sendQueuedReads: sendHung } = await import("../markQueue");
      let settled = false;
      void sendHung().then(() => {
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

  it("cancels opposite marks with no request and settles both waiters", async () => {
    const { queue, sent } = setup();

    const read = queue.mark({ entryIds: ["101:a"], read: true });
    const unread = queue.mark({ entryIds: ["101:a"], read: false });
    await queue.flush();

    await expect(read).resolves.toBeUndefined();
    await expect(unread).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });

  it("settles a call once every id is sent or cancelled out", async () => {
    const { queue, sent } = setup();

    const reads = queue.mark({ entryIds: ["101:a", "101:b"], read: true });
    await queue.mark({ entryIds: ["101:a"], read: false });
    await queue.flush();
    await reads;

    expect(sent).toEqual([{ read: ["101:b"], unread: [], keepalive: false }]);
  });

  it("joins a repeated mark to the queued one and sends the id once", async () => {
    const { queue, sent } = setup();

    const first = queue.mark({ entryIds: ["101:a"], read: true });
    const second = queue.mark({ entryIds: ["101:a"], read: true });
    await queue.flush();

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(sent).toEqual([{ read: ["101:a"], unread: [], keepalive: false }]);
  });

  it("keeps an id in one list only per batch", async () => {
    const { queue, sent } = setup();

    void queue.mark({ entryIds: ["101:a", "101:b"], read: true });
    void queue.mark({ entryIds: ["101:c"], read: false });
    void queue.mark({ entryIds: ["101:a"], read: false });
    void queue.mark({ entryIds: ["101:a"], read: true });
    await queue.flush();

    expect(sent).toEqual([{ read: ["101:b", "101:a"], unread: ["101:c"], keepalive: false }]);
  });

  it("sends a mark behind the in-flight one after it settles", async () => {
    const releases: (() => void)[] = [];
    const sent: Batch[] = [];
    const queue = createMarkQueue({
      send: async (batch) => {
        sent.push(batch);
        await new Promise<void>((resolve) => {
          releases.push(resolve);
        });
      },
    });

    const read = queue.mark({ entryIds: ["101:a"], read: true });
    const flushed = queue.flush();
    await settle();
    expect(sent).toHaveLength(1);
    const unread = queue.mark({ entryIds: ["101:a"], read: false });
    await settle();
    expect(sent).toHaveLength(1);
    releases[0]?.();
    await settle();
    expect(sent).toHaveLength(2);
    releases[1]?.();
    await Promise.all([read, unread, flushed]);

    expect(sent).toEqual([
      { read: ["101:a"], unread: [], keepalive: false },
      { read: [], unread: ["101:a"], keepalive: false },
    ]);
  });

  it("restores the in-flight row when a mark queued behind it is cancelled", async () => {
    const store = fakeStore();
    let release = () => {};
    const queue = createMarkQueue({
      send: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      store,
    });

    void queue.mark({ entryIds: ["101:a"], read: true });
    const flushed = queue.flush();
    await settle();
    void queue.mark({ entryIds: ["101:a"], read: false });
    await settle();
    expect(store.stored.get("101:a")).toBe("unread");
    void queue.mark({ entryIds: ["101:a"], read: true });
    await settle();

    expect(store.stored.get("101:a")).toBe("read");
    release();
    await flushed;
  });

  it("does not resurrect a cancelled mark when a request fails", async () => {
    const store = fakeStore();
    const sent: Batch[] = [];
    let fail = (_error: unknown) => {};
    const queue = createMarkQueue({
      send: async (batch) => {
        sent.push(batch);
        if (sent.length === 1) {
          await new Promise<void>((_resolve, reject) => {
            fail = reject;
          });
        }
      },
      store,
    });

    void queue.mark({ entryIds: ["101:b"], read: true });
    const flushed = queue.flush();
    await settle();
    void queue.mark({ entryIds: ["101:a"], read: true });
    void queue.mark({ entryIds: ["101:a"], read: false });
    fail(new ApiError({ status: 503, code: "http" }));
    await flushed;
    await queue.flush();

    expect(sent).toHaveLength(1);
    expect([...store.stored]).toEqual([["101:b", "read"]]);
  });

  it("rejects every waiter of a failed batch", async () => {
    const { queue } = setup({ fail: true });

    const first = queue.mark({ entryIds: ["101:a"], read: true });
    const second = queue.mark({ entryIds: ["101:b"], read: false });
    const outcomes = Promise.allSettled([first, second]);
    await settle();
    void queue.flush();
    await outcomes;

    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");
  });

  it("drops what waits on reset", async () => {
    const { queue, sent } = setup();

    const settled = queue.mark({ entryIds: ["101:a"], read: true });
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
      http.post("/api/entries/mark", async ({ request }) => {
        seen.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const settled = markQueue.mark({ entryIds: ["101:a"], read: true });
    await stored("101:a");
    window.dispatchEvent(new Event("pagehide"));
    await settled;

    expect(seen).toEqual([{ read: ["101:a"] }]);
  });

  it("sends the next batch as keepalive when a keepalive flush finds a request in flight", async () => {
    const releases: (() => void)[] = [];
    const sent: Batch[] = [];
    const queue = createMarkQueue({
      send: async (batch) => {
        sent.push(batch);
        await new Promise<void>((resolve) => {
          releases.push(resolve);
        });
      },
    });

    void queue.mark({ entryIds: ["101:a"], read: true });
    void queue.flush();
    await settle();
    void queue.mark({ entryIds: ["101:b"], read: true });
    const leaving = queue.flush({ keepalive: true });
    await settle();
    releases[0]?.();
    await settle();
    releases[1]?.();
    await leaving;

    expect(sent.map(({ keepalive }) => keepalive)).toEqual([false, true]);
  });

  describe("when an id is marked again around a request", () => {
    const held = () => {
      const store = fakeStore();
      const sent: Batch[] = [];
      const releases: ((error?: Error) => void)[] = [];
      const queue = createMarkQueue({
        send: async (batch) => {
          sent.push(batch);
          await new Promise<void>((resolve, reject) => {
            releases.push((error) => {
              if (error) reject(error);
              else resolve();
            });
          });
        },
        store,
      });
      return { queue, store, sent, releases };
    };

    it("keeps the row of an id re-marked while its batch was in flight", async () => {
      const { queue, store, releases } = held();

      void queue.mark({ entryIds: ["101:a"], read: true });
      void queue.flush();
      await settle();
      void queue.mark({ entryIds: ["101:a"], read: false });
      void queue.flush();
      await settle();
      releases[0]?.();
      await settle();

      expect(store.stored.get("101:a")).toBe("unread");
      releases[1]?.();
    });

    it("restores the row of a failed send when a mark queued after it is cancelled", async () => {
      const { queue, store, releases } = held();

      void queue.mark({ entryIds: ["101:a"], read: true });
      const failed = queue.flush();
      await settle();
      releases[0]?.(new ApiError({ status: 503, code: "http" }));
      await failed;
      void queue.mark({ entryIds: ["101:a"], read: false });
      void queue.mark({ entryIds: ["101:a"], read: true });
      await settle();

      expect(store.stored.get("101:a")).toBe("read");
    });

    it("sends the opposite of a mark queued behind the same mark in flight", async () => {
      const { queue, store, sent, releases } = held();

      void queue.mark({ entryIds: ["101:a"], read: true });
      void queue.flush();
      await settle();
      void queue.mark({ entryIds: ["101:a"], read: true });
      void queue.mark({ entryIds: ["101:a"], read: false });
      await settle();
      expect(store.stored.get("101:a")).toBe("unread");
      const flushed = queue.flush();
      releases[0]?.();
      await settle();
      releases[1]?.();
      await flushed;

      expect(sent.at(-1)).toEqual({ read: [], unread: ["101:a"], keepalive: false });
    });

    it("sends the opposite of a replayed mark still waiting for a request in flight", async () => {
      const { queue, store, sent, releases } = held();
      store.stored.set("101:a", "read");

      void queue.mark({ entryIds: ["101:b"], read: true });
      void queue.flush();
      await settle();
      const replayed = queue.replay();
      await settle();
      void queue.mark({ entryIds: ["101:a"], read: false });
      await settle();
      releases[0]?.();
      await settle();
      releases[1]?.();
      await replayed;

      expect(sent.at(-1)).toEqual({ read: [], unread: ["101:a"], keepalive: false });
    });
  });

  describe("when a store is injected", () => {
    const withStore = ({ initial = [], error }: { initial?: MarkRow[]; error?: unknown } = {}) => {
      const store = fakeStore(initial);
      const sent: Batch[] = [];
      const queue = createMarkQueue({
        send: async (batch) => {
          await Promise.resolve();
          sent.push(batch);
          if (error) throw error;
        },
        store,
      });
      return { queue, store, sent };
    };

    const row = (id: string, state: MarkState = "read"): MarkRow => ({ id, state });

    it("persists the marks before the flush and removes them once sent", async () => {
      const { queue, store, sent } = withStore();

      const settled = queue.mark({ entryIds: ["101:a"], read: true });
      void queue.mark({ entryIds: ["101:b"], read: false });
      await settle();
      expect(sent).toEqual([]);
      expect([...store.stored]).toEqual([
        ["101:a", "read"],
        ["101:b", "unread"],
      ]);
      await queue.flush();
      await settled;

      expect(store.stored.size).toBe(0);
    });

    it("adds even when the store fails", async () => {
      const { queue, store, sent } = withStore();
      store.add.mockReturnValueOnce(Promise.reject(new Error("quota")));

      const settled = queue.mark({ entryIds: ["101:a"], read: true });
      await settle();
      await queue.flush();
      await settled;

      expect(sent).toHaveLength(1);
    });

    it("keeps the marks and resolves the waiter on a retryable failure", async () => {
      const { queue, store } = withStore({
        error: new ApiError({ status: 503, code: "http" }),
      });

      const settled = queue.mark({ entryIds: ["101:a"], read: true });
      await settle();
      await queue.flush();

      await expect(settled).resolves.toBeUndefined();
      expect(store.stored.get("101:a")).toBe("read");
    });

    it("keeps an offline unread stored, then sends it on replay", async () => {
      const store = fakeStore();
      const sent: Batch[] = [];
      let offline = true;
      const queue = createMarkQueue({
        send: async (batch) => {
          await Promise.resolve();
          sent.push(batch);
          if (offline) throw new TypeError("Failed to fetch");
        },
        store,
      });

      const settled = queue.mark({ entryIds: ["101:a"], read: false });
      await settle();
      await queue.flush();
      await expect(settled).resolves.toBeUndefined();
      expect(store.stored.get("101:a")).toBe("unread");

      offline = false;
      await queue.replay();

      expect(sent.at(-1)).toEqual({ read: [], unread: ["101:a"], keepalive: false });
      expect(store.stored.size).toBe(0);
    });

    it("treats a network error as retryable", async () => {
      const { queue, store } = withStore({ error: new TypeError("Failed to fetch") });

      const settled = queue.mark({ entryIds: ["101:a"], read: true });
      await settle();
      await queue.flush();

      await expect(settled).resolves.toBeUndefined();
      expect(store.stored.has("101:a")).toBe(true);
    });

    it("removes the marks and rejects the waiter on a non-retryable failure", async () => {
      const { queue, store } = withStore({
        error: new ApiError({ status: 400, code: "http" }),
      });

      const outcome = queue.mark({ entryIds: ["101:a"], read: false }).then(
        () => undefined,
        (rejection: unknown) => rejection,
      );
      await settle();
      await queue.flush();

      expect(await outcome).toMatchObject({ status: 400 });
      expect(store.stored.size).toBe(0);
    });

    it("removes a cancelled mark from the store", async () => {
      const { queue, store } = withStore();

      void queue.mark({ entryIds: ["101:a", "101:b"], read: true });
      void queue.mark({ entryIds: ["101:a"], read: false });
      await settle();

      expect([...store.stored.keys()]).toEqual(["101:b"]);
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

      void queue.mark({ entryIds: ["101:a"], read: true });
      void queue.mark({ entryIds: ["101:a"], read: false });
      const replayed = queue.replay();
      await settle();
      release();
      await replayed;

      expect(sent).toEqual([]);
    });

    it("replays the stored marks of both kinds", async () => {
      const { queue, store, sent } = withStore({
        initial: [row("101:a"), row("101:b", "unread")],
      });

      await queue.replay();

      expect(sent).toEqual([{ read: ["101:a"], unread: ["101:b"], keepalive: false }]);
      expect(store.stored.size).toBe(0);
    });

    it("does not send an id twice when replays overlap", async () => {
      const store = fakeStore([row("101:a")]);
      const sent: Batch[] = [];
      const queue = createMarkQueue({
        send: async (batch) => {
          sent.push(batch);
          await new Promise((resolve) => setTimeout(resolve, 5));
        },
        store,
      });

      const first = queue.replay();
      await new Promise((resolve) => setTimeout(resolve, 1));
      await Promise.all([first, queue.replay()]);

      expect(sent).toEqual([{ read: ["101:a"], unread: [], keepalive: false }]);
    });

    it("sends nothing on replay when the store is empty", async () => {
      const { queue, sent } = withStore();

      await queue.replay();

      expect(sent).toEqual([]);
    });

    it("raises nothing when a replayed send fails", async () => {
      const { queue, store } = withStore({
        initial: [row("101:a")],
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

    it("settles the waiter when the store cannot remove the marks after a send", async () => {
      const { queue, store } = withStore();
      store.remove.mockRejectedValue(new Error("quota"));

      const settled = queue.mark({ entryIds: ["101:a"], read: true });
      await settle();
      await queue.flush();

      await expect(settled).resolves.toBeUndefined();
    });

    it("still rejects the waiter when the store cannot remove the marks of a failed send", async () => {
      const { queue, store } = withStore({ error: new ApiError({ status: 400, code: "http" }) });
      store.remove.mockRejectedValue(new Error("quota"));

      const outcome = queue.mark({ entryIds: ["101:a"], read: true }).then(
        () => undefined,
        (rejection: unknown) => rejection,
      );
      await settle();
      await queue.flush();

      expect(await outcome).toMatchObject({ status: 400 });
    });

    it("cancels even when the store cannot remove the marks", async () => {
      const { queue, store, sent } = withStore();
      store.remove.mockRejectedValue(new Error("quota"));

      const read = queue.mark({ entryIds: ["101:a"], read: true });
      const unread = queue.mark({ entryIds: ["101:a"], read: false });
      await queue.flush();

      await expect(Promise.all([read, unread])).resolves.toEqual([undefined, undefined]);
      expect(sent).toEqual([]);
    });

    it("sends nothing on replay when the store cannot be read", async () => {
      const { queue, store, sent } = withStore();
      store.all.mockRejectedValue(new Error("blocked"));

      await queue.replay();

      expect(sent).toEqual([]);
    });

    it("leaves marks whose store write is in flight to their own batch on replay", async () => {
      const { queue, store, sent } = withStore();

      const settled = queue.mark({ entryIds: ["101:a"], read: true });
      store.all.mockResolvedValueOnce([row("101:a")]);
      await queue.replay();
      await queue.flush();
      await settled;

      expect(sent).toEqual([{ read: ["101:a"], unread: [], keepalive: false }]);
    });

    it("registers the sync tag after a retryable failure on a hidden page, not on mark", async () => {
      const register = stubSync();
      stubVisibility("hidden");
      const { queue } = withStore({ error: new ApiError({ status: 503, code: "http" }) });

      const settled = queue.mark({ entryIds: ["101:a"], read: false });
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

      const settled = queue.mark({ entryIds: ["101:a"], read: true });
      await settle();
      await queue.flush();
      await settled;
      await settle();

      expect(register).not.toHaveBeenCalled();
    });

    it("keeps a mark made while a replay reads the store", async () => {
      const { queue, store, sent } = withStore({ initial: [row("101:a"), row("101:b")] });
      const read = store.all.getMockImplementation();
      store.all.mockImplementationOnce(async () => {
        const result = (await read?.()) ?? [];
        void queue.mark({ entryIds: ["101:a"], read: false });
        return result;
      });

      await queue.replay();

      expect(sent).toEqual([{ read: ["101:b"], unread: ["101:a"], keepalive: false }]);
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

      const settled = markQueue.mark({ entryIds: ["101:a"], read: true });
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
      let release = () => {};
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(
          async () =>
            new Promise<Response>((resolve) => {
              release = () => {
                resolve(new Response(null, { status: 204 }));
              };
            }),
        ),
      );
      stubVisibility("hidden");

      const settled = markQueue.mark({ entryIds: ["101:b"], read: true });
      await stored("101:b");
      window.dispatchEvent(new Event("pagehide"));
      await settle();

      expect(register).toHaveBeenCalledWith("mark-read");
      release();
      await settled;
    });

    it("keeps the batch queued when the page becomes visible", async () => {
      const fetchStub = vi.fn<typeof fetch>(async () => {
        await Promise.resolve();
        return new Response(null, { status: 204 });
      });
      vi.stubGlobal("fetch", fetchStub);
      stubVisibility("visible");

      void markQueue.mark({ entryIds: ["101:a"], read: true });
      await stored("101:a");
      document.dispatchEvent(new Event("visibilitychange"));
      await settle();

      expect(fetchStub).not.toHaveBeenCalled();
    });

    it("replays the stored ids when the browser goes online", async () => {
      vi.stubEnv("VITE_API_MODE", "real");
      const seen: unknown[] = [];
      server.use(
        http.post("/api/entries/mark", async ({ request }) => {
          seen.push(await request.json());
          return new HttpResponse(null, { status: 204 });
        }),
      );
      await markStore.add([{ id: "101:z", state: "read" }]);

      window.dispatchEvent(new Event("online"));

      await vi.waitFor(() => {
        expect(seen).toEqual([{ read: ["101:z"] }]);
      });
    });
  });
});
