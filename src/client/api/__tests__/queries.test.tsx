import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { CATEGORY_ORDER_KEY } from "shared/feedsApi/preferences";
import type { StreamKey } from "shared/feedsApi/streamKey";
import type { Counts, Entry, EntryPage, Feed, Preferences } from "shared/feedsApi/types";
import { PreferencesUpdateSchema } from "shared/feedsApi/types";
import { server } from "test/msw";
import { seedCategories, seedCategoryId, seedCategoryKey } from "test/seedCategories";
import { DEMO_NEWSLETTER_ADDRESS, resetFixtureState } from "../adapters/fixture";
import { getFeeds } from "../client";
import { markReadQueue } from "../markReadQueue";
import {
  DeleteAndMoveError,
  flattenStream,
  keys,
  unreadCountFor,
  useDeleteCategoryAndMove,
  useMarkRead,
  useNewsletterAddress,
  usePreferences,
  useRefreshEntries,
  useRenameCategory,
  useReorderCategories,
  useSearchContents,
  useStream,
  useUpdateFeed,
} from "../queries";

const techKey = seedCategoryKey("Tech");

const setup = () => {
  resetFixtureState();
  vi.stubEnv("VITE_API_MODE", "mock");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

const entry = ({ id, feedId = "101" }: { id: string; feedId?: string }): Entry => ({
  id,
  feedId,
  title: id,
  published: Date.now(),
  unread: true,
});

const page = (items: Entry[]): InfiniteData<EntryPage> => ({
  pages: [{ items }],
  pageParams: [undefined],
});

const categoryIdsOf = async (feedId: string): Promise<string[] | undefined> =>
  (await getFeeds()).find((feed) => feed.id === feedId)?.categoryIds;

describe("queries", () => {
  const counts: Counts = { all: 9, feeds: { "101": 4 }, categories: { Tech: 6 } };

  it.each<[StreamKey | undefined, number]>([
    ["all", 9],
    ["folder:Tech", 6],
    ["feed:101", 4],
    ["feed:999", 0],
    ["read", 0],
    [undefined, 0],
  ])("counts %s as %d unread", (streamKey, expected) => {
    expect(unreadCountFor({ counts, streamKey })).toBe(expected);
  });

  it("pages a folder stream into one entry list", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useStream({ streamKey: techKey }), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    while (result.current.hasNextPage) {
      await act(async () => {
        await result.current.fetchNextPage();
      });
    }

    const entries = flattenStream(result.current.data);
    expect(entries).toHaveLength(15);
    expect(new Set(entries.map((item) => item.feedId))).toEqual(new Set(["101", "102", "103"]));
  });

  it("drops a story repeated across pages", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useStream({ streamKey: techKey }), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    const { data } = result.current;
    const repeated = data && {
      pages: [...data.pages, ...data.pages],
      pageParams: [...data.pageParams, ...data.pageParams],
    };
    expect(flattenStream(repeated)).toEqual(flattenStream(data));
  });

  it("searches inside the stream it is handed", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useSearchContents({ streamKey: techKey, query: "from feed 102" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const entries = flattenStream(result.current.data);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((item) => item.feedId === "102")).toBe(true);
  });

  it("stays idle until the query is long enough", () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useSearchContents({ streamKey: techKey, query: " c " }), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("trims the cache to the first page and invalidates the counts on refresh", async () => {
    const { client, wrapper } = setup();
    const queryKey = keys.stream({ streamKey: techKey });
    const { result } = renderHook(
      () => ({ stream: useStream({ streamKey: techKey }), refresh: useRefreshEntries() }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.stream.isSuccess).toBe(true);
    });
    await act(async () => {
      await result.current.stream.fetchNextPage();
    });
    expect(client.getQueryData<InfiniteData<EntryPage>>(queryKey)?.pages).toHaveLength(2);
    client.setQueryData<Counts>(keys.counts, { all: 0, feeds: {}, categories: {} });

    const pending = result.current.refresh(queryKey);
    expect(
      client.getQueryData<InfiniteData<EntryPage>>(queryKey)?.pages[0]?.items.length,
    ).toBeGreaterThan(0);
    await act(async () => pending);

    const refreshed = client.getQueryData<InfiniteData<EntryPage>>(queryKey);
    expect(refreshed?.pages).toHaveLength(1);
    expect(refreshed?.pageParams).toHaveLength(1);
    expect(client.getQueryState(keys.counts)?.isInvalidated).toBe(true);
  });

  it("flushes the queued read marks before it refetches", async () => {
    const { client, wrapper } = setup();
    const queryKey = keys.stream({ streamKey: techKey });
    const { result } = renderHook(
      () => ({ stream: useStream({ streamKey: techKey }), refresh: useRefreshEntries() }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.stream.isSuccess).toBe(true);
    });
    let release = () => {};
    const flush = vi.spyOn(markReadQueue, "flush").mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });

    const pending = result.current.refresh(queryKey);
    await Promise.resolve();

    expect(flush).toHaveBeenCalledOnce();
    expect(client.getQueryState(queryKey)?.fetchStatus).toBe("idle");
    release();
    await act(async () => pending);
    flush.mockRestore();
  });

  it("invalidates the preferences when a category is renamed", async () => {
    const { client, wrapper } = setup();
    client.setQueryData<Preferences>(keys.preferences, {});
    const { result } = renderHook(() => useRenameCategory(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        categoryId: seedCategoryId("Design"),
        label: "Design & UX",
      });
    });

    expect(client.getQueryState(keys.preferences)?.isInvalidated).toBe(true);
  });

  it("flips the entry in every cached stream and search page at once", async () => {
    const { client, wrapper } = setup();
    const streamKey = keys.stream({ streamKey: techKey });
    const searchKey = keys.search({ streamKey: techKey, query: "story" });
    client.setQueryData(streamKey, page([entry({ id: "101:a" })]));
    client.setQueryData(searchKey, page([entry({ id: "101:a" })]));
    const { result } = renderHook(() => useMarkRead(), { wrapper });

    act(() => {
      result.current.mutate({ entryIds: ["101:a"], read: true });
    });

    await waitFor(() => {
      for (const key of [streamKey, searchKey]) {
        expect(flattenStream(client.getQueryData(key))[0]?.unread).toBe(false);
      }
    });
  });

  it("counts an entry cached under two streams once, in its feed, categories and total", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(
      keys.stream({ streamKey: "all" }),
      page([entry({ id: "103:a", feedId: "103" })]),
    );
    client.setQueryData(
      keys.stream({ streamKey: techKey }),
      page([entry({ id: "103:a", feedId: "103" })]),
    );
    client.setQueryData(keys.entry("103:a"), entry({ id: "103:a", feedId: "103" }));
    client.setQueryData(keys.categories, seedCategories);
    client.setQueryData<Counts>(keys.counts, {
      all: 10,
      feeds: { "103": 4 },
      categories: { Tech: 6, Design: 5, News: 3 },
    });
    const { result } = renderHook(() => useMarkRead(), { wrapper });

    act(() => {
      result.current.mutate({ entryIds: ["103:a"], read: true });
    });

    // Feed 103 sits in both Tech and Design.
    await waitFor(() => {
      expect(client.getQueryData<Counts>(keys.counts)).toEqual({
        all: 9,
        feeds: { "103": 3 },
        categories: { Tech: 5, Design: 4, News: 3 },
      });
    });
    expect(client.getQueryData<Entry>(keys.entry("103:a"))?.unread).toBe(false);
  });

  it("rolls back only the batch whose request failed", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const first = ["a", "b", "c", "d", "e"].map((id) => `101:${id}`);
    const second = ["f", "g", "h", "i", "j"].map((id) => `101:${id}`);
    const streamKey = keys.stream({ streamKey: techKey });
    client.setQueryData(streamKey, page([...first, ...second].map((id) => entry({ id }))));
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let posts = 0;
    server.use(
      http.post("/api/entries/read", async () => {
        if (posts++ === 0) {
          await held;
          return HttpResponse.json({ error: "boom" }, { status: 500 });
        }
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = renderHook(() => ({ a: useMarkRead(), b: useMarkRead() }), { wrapper });

    let settled: Promise<unknown> = Promise.resolve();
    act(() => {
      settled = Promise.allSettled([
        result.current.a.mutateAsync({ entryIds: first, read: true }),
        result.current.b.mutateAsync({ entryIds: second, read: true }),
      ]);
    });
    await waitFor(() => {
      expect(posts).toBe(2);
    });
    release();
    await act(async () => settled);

    const unread = new Map(
      flattenStream(client.getQueryData(streamKey)).map((item) => [item.id, item.unread]),
    );
    expect(first.every((id) => unread.get(id) === true)).toBe(true);
    expect(second.every((id) => unread.get(id) === false)).toBe(true);
  });

  it("pulls a queued read out of the batch when it is marked unread", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    client.setQueryData(keys.stream({ streamKey: techKey }), page([entry({ id: "101:a" })]));
    const reads: unknown[] = [];
    server.use(
      http.post("/api/entries/read", async ({ request }) => {
        reads.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
      http.post("/api/entries/unread", () => new HttpResponse(null, { status: 204 })),
    );
    const { result } = renderHook(() => useMarkRead(), { wrapper });

    act(() => {
      result.current.mutate({ entryIds: ["101:a"], read: true });
    });
    await act(async () => {
      await result.current.mutateAsync({ entryIds: ["101:a"], read: false });
      await markReadQueue.flush();
    });

    expect(reads).toEqual([]);
  });

  it("saves a feed's title and categories in one PATCH", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useUpdateFeed(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        feedId: "104",
        title: "Renamed",
        categoryIds: ["Design", "News"],
      });
    });

    const saved = (await getFeeds()).find((feed) => feed.id === "104");
    expect(saved).toMatchObject({ title: "Renamed", categoryIds: ["Design", "News"] });
  });

  it("moves the orphans to the target and deletes the category", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useDeleteCategoryAndMove(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        categoryId: "Design",
        targetId: "News",
        moveAll: false,
      });
    });

    for (const feedId of ["104", "105", "109"])
      expect(await categoryIdsOf(feedId)).toEqual(["News"]);
    expect(await categoryIdsOf("103")).toEqual(["Tech"]);
  });

  it("also moves the feeds filed elsewhere too when moveAll is set", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useDeleteCategoryAndMove(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ categoryId: "Design", targetId: "News", moveAll: true });
    });

    for (const feedId of ["104", "105", "109"])
      expect(await categoryIdsOf(feedId)).toEqual(["News"]);
    expect(await categoryIdsOf("103")).toEqual(["Tech", "News"]);
  });

  it("stops at the first failed PATCH, sends no DELETE, and reports how many moved", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const orphan = (id: string): Feed => ({
      id,
      title: id,
      categoryIds: ["Design"],
      isNewsletter: false,
    });
    client.setQueryData<Feed[]>(keys.feeds, [orphan("1"), orphan("2"), orphan("3")]);
    let patches = 0;
    let deletes = 0;
    server.use(
      http.patch("/api/feeds/:id", ({ params }) => {
        patches += 1;
        return patches === 2
          ? HttpResponse.json({ error: "boom" }, { status: 500 })
          : HttpResponse.json(orphan(String(params.id)));
      }),
      http.delete("/api/categories/:id", () => {
        deletes += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = renderHook(() => useDeleteCategoryAndMove(), { wrapper });

    let caught: unknown;
    await act(async () => {
      caught = await result.current
        .mutateAsync({ categoryId: "Design", targetId: "News", moveAll: false })
        .catch((error: unknown) => error);
    });

    expect(caught).toBeInstanceOf(DeleteAndMoveError);
    expect(caught).toMatchObject({ moved: 1 });
    expect(patches).toBe(2);
    expect(deletes).toBe(0);
  });

  it("refuses the category being deleted as its own target, before any request", async () => {
    const { wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    let requests = 0;
    server.use(
      http.all("/api/*", () => {
        requests += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = renderHook(() => useDeleteCategoryAndMove(), { wrapper });

    let caught: unknown;
    await act(async () => {
      caught = await result.current
        .mutateAsync({ categoryId: "Design", targetId: "Design", moveAll: true })
        .catch((error: unknown) => error);
    });

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(DeleteAndMoveError);
    expect(requests).toBe(0);
  });

  it("answers the account's newsletter address", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useNewsletterAddress(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual({ emailAddress: DEMO_NEWSLETTER_ADDRESS });
    });
  });

  const order = ["Design", "Tech"];

  it("writes the order as a JSON string into the preferences cache", async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useReorderCategories(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ categoryIds: order });
    });

    expect(client.getQueryData<Preferences>(keys.preferences)?.[CATEGORY_ORDER_KEY]).toBe(
      JSON.stringify(order),
    );
  });

  it("restores the previous order when the write fails", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const previous = JSON.stringify(["News"]);
    client.setQueryData<Preferences>(keys.preferences, { [CATEGORY_ORDER_KEY]: previous });
    server.use(
      http.post("/api/preferences", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );
    const { result } = renderHook(() => useReorderCategories(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ categoryIds: order }).catch(() => undefined);
    });

    expect(client.getQueryData<Preferences>(keys.preferences)?.[CATEGORY_ORDER_KEY]).toBe(previous);
  });

  describe("when a second write lands while the first is in flight", () => {
    const firstIds = ["News"];
    const secondIds = ["Newsletters"];
    const second = JSON.stringify(secondIds);

    // Holds the first POST until released and answers each one from `outcomes`.
    const serve = ({ outcomes }: { outcomes: ("fail" | "save")[] }) => {
      const { client, wrapper } = setup();
      vi.stubEnv("VITE_API_MODE", "real");
      let store: Preferences = { [CATEGORY_ORDER_KEY]: JSON.stringify(order) };
      client.setQueryData<Preferences>(keys.preferences, store);
      let release = (): void => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const posts: unknown[] = [];
      server.use(
        http.get("/api/preferences", () => HttpResponse.json(store)),
        http.post("/api/preferences", async ({ request }) => {
          const patch = PreferencesUpdateSchema.parse(await request.json());
          const index = posts.push(patch) - 1;
          if (index === 0) await held;
          if (outcomes[index] === "fail")
            return HttpResponse.json({ error: "boom" }, { status: 500 });
          for (const [key, value] of Object.entries(patch))
            if (value !== null) store = { ...store, [key]: value };
          return new HttpResponse(null, { status: 204 });
        }),
      );
      const { result } = renderHook(
        () => ({ a: useReorderCategories(), b: useReorderCategories(), prefs: usePreferences() }),
        { wrapper },
      );
      const cachedOrder = () =>
        client.getQueryData<Preferences>(keys.preferences)?.[CATEGORY_ORDER_KEY];
      const run = async () => {
        let settled: Promise<unknown> = Promise.resolve();
        act(() => {
          settled = Promise.allSettled([
            result.current.a.mutateAsync({ categoryIds: firstIds }),
            result.current.b.mutateAsync({ categoryIds: secondIds }),
          ]);
        });
        await waitFor(() => {
          expect(posts).toHaveLength(1);
        });
        expect(cachedOrder()).toBe(second);
        release();
        await act(async () => settled);
      };
      return { posts, cachedOrder, run };
    };

    it("sends it only after the first settles, and keeps it when the first fails", async () => {
      const { posts, cachedOrder, run } = serve({ outcomes: ["fail", "save"] });

      await run();

      expect(posts).toHaveLength(2);
      await waitFor(() => {
        expect(cachedOrder()).toBe(second);
      });
    });

    it("lands on the stored order when both fail", async () => {
      const { posts, cachedOrder, run } = serve({ outcomes: ["fail", "fail"] });

      await run();

      expect(posts).toHaveLength(2);
      await waitFor(() => {
        expect(cachedOrder()).toBe(JSON.stringify(order));
      });
    });
  });
});
