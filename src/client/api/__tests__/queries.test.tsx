import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { CATEGORY_ORDER_KEY } from "shared/feedsApi/preferences";
import type { StreamKey } from "shared/feedsApi/streamKey";
import type { Category, Counts, Entry, EntryPage, Feed, Preferences } from "shared/feedsApi/types";
import { PreferencesUpdateSchema } from "shared/feedsApi/types";
import { server } from "test/msw";
import { seedCategories, seedCategoryId, seedCategoryKey } from "test/seedCategories";
import { DEMO_NEWSLETTER_ADDRESS, resetFixtureState } from "../adapters/fixture";
import { ApiError, getFeeds } from "../client";
import { markReadQueue } from "../markReadQueue";
import { markReadStore } from "../markReadStore";
import type { MatchCount } from "../queries";
import {
  DeleteAndMoveError,
  flattenStream,
  isPremiumRequired,
  keys,
  pageCountFor,
  unreadCountFor,
  useAnalyzeWebFeed,
  useCounts,
  useCategories,
  useCreateWebFeed,
  useFeeds,
  useDeleteCategoryAndMove,
  useMarkRead,
  useMatchCount,
  useNewsletterAddress,
  usePreferences,
  useRefreshAllLists,
  useRefreshEntries,
  useRenameCategory,
  useReanalyzeWebFeed,
  useReorderCategories,
  useSearchContents,
  useStream,
  useUpdateFeed,
  useWebFeedStatus,
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

const resolved = async <T,>(value: T): Promise<T> => {
  await Promise.resolve();
  return value;
};

const held = (): { wait: Promise<void>; release: () => void } => {
  let release = (): void => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
};

const seedLibrary = (client: QueryClient) => {
  const design: Category = { id: "Design", label: "Design", feedIds: ["104"] };
  const news: Category = { id: "News", label: "News", feedIds: [] };
  const feed: Feed = { id: "104", title: "Longform", categoryIds: ["Design"], isNewsletter: false };
  client.setQueryData<Category[]>(keys.categories, [design, news]);
  client.setQueryData<Feed[]>(keys.feeds, [feed]);
  return { design, news, feed };
};

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
    expect(entries).toHaveLength(22);
    expect(new Set(entries.map((item) => item.feedId))).toEqual(new Set(["101", "102", "103"]));
  });

  it.each<[Parameters<typeof pageCountFor>[0]["tier"], StreamKey, number | undefined]>([
    ["desktop", "all", 24],
    ["desktop", techKey, 24],
    ["desktop", "read", 24],
    ["desktop", "feed:101", 12],
    ["tablet", "all", undefined],
    ["phone", "feed:101", undefined],
  ])("sends a %s page of %s as count %s", (tier, streamKey, expected) => {
    expect(pageCountFor({ tier, streamKey })).toBe(expected);
  });

  it("passes count to the adapter and keeps pages of two sizes apart", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useStream({ streamKey: "all", count: 5 }), { wrapper });
    const { result: unsized } = renderHook(() => useStream({ streamKey: "all" }), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess && unsized.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.pages[0]?.items).toHaveLength(5);
    expect(unsized.current.data?.pages[0]?.items).toHaveLength(12);
    expect(keys.stream({ streamKey: "all", count: 5 })).not.toEqual(
      keys.stream({ streamKey: "all" }),
    );
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

  describe("when counting matches with useMatchCount", () => {
    const entries = (n: number) => Array.from({ length: n }, (_, i) => entry({ id: `101:${i}` }));
    const matchKeys = {
      stream: (unreadOnly: boolean) =>
        keys.stream({ streamKey: techKey, unreadOnly, order: "newest", count: 50 }),
      search: (unreadOnly: boolean) =>
        keys.search({ streamKey: techKey, query: "story", unreadOnly, count: 50 }),
    };
    const seedFresh = (client: QueryClient) => {
      client.setQueryDefaults(["stream"], { staleTime: Infinity });
      client.setQueryDefaults(["search"], { staleTime: Infinity });
      client.setQueryDefaults(keys.counts, { staleTime: Infinity });
    };

    it.each<[number, MatchCount | undefined]>([
      [0, undefined],
      [7, { count: 7, capped: false }],
      [49, { count: 49, capped: false }],
      [50, { count: 50, capped: true }],
      [120, { count: 50, capped: true }],
    ])("reads %i unread from the counts as %o", async (unread, expected) => {
      const { client, wrapper } = setup();
      seedFresh(client);
      client.setQueryData<Counts>(keys.counts, { all: 9, feeds: {}, categories: { Tech: unread } });
      const { result } = renderHook(
        () => useMatchCount({ streamKey: techKey, unreadOnly: true, query: "" }),
        { wrapper },
      );

      await waitFor(() => {
        expect(client.getQueryData(keys.counts)).toBeDefined();
      });
      expect(result.current).toEqual(expected);
    });

    it("is undefined while the counts are loading", () => {
      const { wrapper } = setup();
      const { result } = renderHook(
        () => useMatchCount({ streamKey: techKey, unreadOnly: true, query: "" }),
        { wrapper },
      );

      expect(result.current).toBeUndefined();
    });

    it("counts the entries of a page when the unread filter is off", async () => {
      const { client, wrapper } = setup();
      seedFresh(client);
      client.setQueryData(matchKeys.stream(false), page(entries(3)));
      const { result } = renderHook(
        () => useMatchCount({ streamKey: techKey, unreadOnly: false, query: "" }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current).toEqual({ count: 3, capped: false });
      });
    });

    it("asks a feed for one page of 12, two upstream calls, and caps it there", async () => {
      const { client, wrapper } = setup();
      seedFresh(client);
      const feedKey = keys.stream({
        streamKey: "feed:101",
        unreadOnly: false,
        order: "newest",
        count: 12,
      });
      client.setQueryData(feedKey, page(entries(12)));
      const { result } = renderHook(
        () => useMatchCount({ streamKey: "feed:101", unreadOnly: false, query: "" }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current).toEqual({ count: 12, capped: true });
      });
    });

    it("keeps a full page capped after one of its entries is read", async () => {
      const { client, wrapper } = setup();
      seedFresh(client);
      const [first, ...rest] = entries(50);
      client.setQueryData(matchKeys.search(true), page([{ ...first, unread: false }, ...rest]));
      const { result } = renderHook(
        () => useMatchCount({ streamKey: techKey, unreadOnly: true, query: "story" }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current).toEqual({ count: 50, capped: true });
      });
    });

    it("counts a full page of search results", async () => {
      const { client, wrapper } = setup();
      seedFresh(client);
      client.setQueryData(matchKeys.search(false), page(entries(50)));
      const { result } = renderHook(
        () => useMatchCount({ streamKey: techKey, unreadOnly: false, query: "story" }),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current).toEqual({ count: 50, capped: true });
      });
    });

    it("drops by one when a search result is read, and returns on rollback", async () => {
      const { client, wrapper } = setup();
      vi.stubEnv("VITE_API_MODE", "real");
      seedFresh(client);
      client.setQueryData(matchKeys.search(true), page(entries(3)));
      server.use(
        http.post("/api/entries/read", () => HttpResponse.json({ error: "bad" }, { status: 400 })),
      );
      const { result } = renderHook(
        () => ({
          count: useMatchCount({ streamKey: techKey, unreadOnly: true, query: "story" }),
          markRead: useMarkRead(),
        }),
        { wrapper },
      );
      await waitFor(() => {
        expect(result.current.count?.count).toBe(3);
      });

      await act(async () => {
        const settled = result.current.markRead.mutateAsync({ entryIds: ["101:0"], read: true });
        await vi.waitFor(() => {
          expect(result.current.count?.count).toBe(2);
        });
        await markReadQueue.flush();
        await settled.catch(() => undefined);
      });

      await waitFor(() => {
        expect(result.current.count?.count).toBe(3);
      });
    });

    it("shows nothing for a one-character search", () => {
      const { wrapper } = setup();
      const { result } = renderHook(
        () => useMatchCount({ streamKey: techKey, unreadOnly: false, query: "s" }),
        { wrapper },
      );

      expect(result.current).toBeUndefined();
    });

    it("shows nothing in the read stream", () => {
      const { client, wrapper } = setup();
      const { result } = renderHook(
        () => useMatchCount({ streamKey: "read", unreadOnly: true, query: "" }),
        { wrapper },
      );

      expect(result.current).toBeUndefined();
      expect(client.isFetching()).toBe(0);
    });

    it("sends no request without a stream", () => {
      const { client, wrapper } = setup();
      const { result } = renderHook(
        () => useMatchCount({ streamKey: undefined, unreadOnly: true, query: "story" }),
        { wrapper },
      );

      expect(result.current).toBeUndefined();
      expect(client.isFetching()).toBe(0);
    });
  });

  it("stays idle until the query is long enough", () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useSearchContents({ streamKey: techKey, query: " c " }), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("trims the cache to the first page and refetches the counts on refresh", async () => {
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
    client.setQueryDefaults(keys.counts, { queryFn: async () => resolved(counts) });
    client.setQueryData<Counts>(keys.counts, { all: 0, feeds: {}, categories: {} });
    const countsBefore = client.getQueryState(keys.counts)?.dataUpdatedAt ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 5));

    const pending = result.current.refresh({ queryKey });
    expect(
      client.getQueryData<InfiniteData<EntryPage>>(queryKey)?.pages[0]?.items.length,
    ).toBeGreaterThan(0);
    await act(async () => pending);

    const refreshed = client.getQueryData<InfiniteData<EntryPage>>(queryKey);
    expect(refreshed?.pages).toHaveLength(1);
    expect(refreshed?.pageParams).toHaveLength(1);
    expect(client.getQueryState(keys.counts)?.dataUpdatedAt).toBeGreaterThan(countsBefore);
    expect(client.getQueryData<Counts>(keys.counts)).toEqual(counts);
  });

  it("refetches the subscription library on refresh", async () => {
    const { client, wrapper } = setup();
    const queryKey = keys.stream({ streamKey: techKey });
    const { result } = renderHook(() => useRefreshEntries(), { wrapper });
    client.setQueryDefaults(keys.counts, { queryFn: async () => resolved(counts) });
    client.setQueryData(keys.counts, counts);
    client.setQueryDefaults(keys.categories, { queryFn: async () => resolved([]) });
    client.setQueryData(keys.categories, [{ id: "stale" }]);
    client.setQueryDefaults(keys.feeds, { queryFn: async () => resolved([]) });
    client.setQueryData(keys.feeds, [{ id: "stale" }]);

    await act(async () => result.current({ queryKey }));

    expect(client.getQueryData(keys.categories)).toEqual([]);
    expect(client.getQueryData(keys.feeds)).toEqual([]);
  });

  it("keeps every loaded page when it refreshes without trimming", async () => {
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
    const before = client.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 5));

    const pending = result.current.refresh({ queryKey, trim: false });
    expect(client.getQueryData<InfiniteData<EntryPage>>(queryKey)?.pages).toHaveLength(2);
    await act(async () => pending);

    expect(client.getQueryData<InfiniteData<EntryPage>>(queryKey)?.pages).toHaveLength(2);
    expect(client.getQueryState(queryKey)?.dataUpdatedAt).toBeGreaterThan(before);
  });

  it("keeps the data timestamp while it trims, so only the refetch advances it", async () => {
    const { client, wrapper } = setup();
    const queryKey = keys.stream({ streamKey: techKey });
    const { result } = renderHook(
      () => ({ stream: useStream({ streamKey: techKey }), refresh: useRefreshEntries() }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.stream.isSuccess).toBe(true);
    });
    const before = client.getQueryState(queryKey)?.dataUpdatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));

    const pending = result.current.refresh({ queryKey });
    expect(client.getQueryState(queryKey)?.dataUpdatedAt).toBe(before);
    await act(async () => pending);
    expect(client.getQueryState(queryKey)?.dataUpdatedAt).toBeGreaterThan(before ?? 0);
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
    const flush = vi.spyOn(markReadQueue, "flush").mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });

    const pending = result.current.refresh({ queryKey });
    await Promise.resolve();

    expect(flush).toHaveBeenCalledOnce();
    expect(client.getQueryState(queryKey)?.fetchStatus).toBe("idle");
    release();
    await act(async () => pending);
    flush.mockRestore();
  });

  it("flushes, then invalidates every list cache and the counts, keeping every page", async () => {
    const { client, wrapper } = setup();
    const streamKey = keys.stream({ streamKey: techKey });
    const searchKey = keys.search({ streamKey: techKey, query: "ab" });
    const twoPages = {
      pages: [{ items: [entry({ id: "a" })] }, { items: [entry({ id: "b" })] }],
      pageParams: [undefined, "2"],
    };
    client.setQueryData(streamKey, twoPages);
    client.setQueryData(searchKey, page([entry({ id: "s" })]));
    client.setQueryData(keys.entry("a"), entry({ id: "a" }));
    client.setQueryDefaults(keys.counts, { queryFn: async () => resolved(counts) });
    client.setQueryData(keys.counts, { all: 0, feeds: {}, categories: {} });
    const countsBefore = client.getQueryState(keys.counts)?.dataUpdatedAt ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 5));
    let release = () => {};
    const flush = vi.spyOn(markReadQueue, "flush").mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const { result } = renderHook(() => useRefreshAllLists(), { wrapper });

    const pending = result.current();
    await Promise.resolve();

    expect(client.getQueryState(streamKey)?.isInvalidated).toBe(false);
    release();
    await act(async () => pending);
    expect(client.getQueryState(streamKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(searchKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.entry("a"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.counts)?.dataUpdatedAt).toBeGreaterThan(countsBefore);
    expect(client.getQueryData<InfiniteData<EntryPage>>(streamKey)?.pages).toHaveLength(2);
    flush.mockRestore();
  });

  describe("when counts and stories refresh together", () => {
    it.each<["one" | "all", string]>([
      ["one", "a single list"],
      ["all", "every list"],
    ])("holds %s until the counts fetch settles, even when it fails", async (which) => {
      const { client, wrapper } = setup();
      const queryKey = keys.stream({ streamKey: techKey });
      let fail = () => {};
      client.setQueryDefaults(keys.counts, {
        queryFn: async () =>
          new Promise<Counts>((_resolve, reject) => {
            fail = () => {
              reject(new Error("counts down"));
            };
          }),
      });
      const stories = vi.fn<() => Promise<InfiniteData<EntryPage>>>(async () =>
        Promise.resolve(page([entry({ id: "b" })])),
      );
      client.setQueryDefaults(queryKey, { queryFn: stories });
      client.setQueryData(queryKey, page([entry({ id: "a" })]));
      client.setQueryData(keys.counts, counts);
      const { result } = renderHook(
        () => ({ one: useRefreshEntries(), all: useRefreshAllLists() }),
        { wrapper },
      );
      const storiesBefore = client.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
      await new Promise((resolve) => setTimeout(resolve, 5));

      const pending = which === "one" ? result.current.one({ queryKey }) : result.current.all();
      await waitFor(() => {
        expect(client.getQueryState(keys.counts)?.fetchStatus).toBe("fetching");
      });
      expect(client.getQueryState(queryKey)?.fetchStatus).toBe("idle");
      expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);
      expect(stories).not.toHaveBeenCalled();

      fail();
      await act(async () => pending);
      expect(client.getQueryState(keys.counts)?.status).toBe("error");
      const state = client.getQueryState(queryKey);
      expect(state?.isInvalidated || (state?.dataUpdatedAt ?? 0) > storiesBefore).toBe(true);
    });

    it("does not poll the counts or refetch them on a later mount", async () => {
      vi.useFakeTimers();
      try {
        const { client, wrapper } = setup();
        client.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
        let fetches = 0;
        client.getQueryCache().subscribe((event) => {
          if (
            event.type === "updated" &&
            event.action.type === "fetch" &&
            event.query.queryHash === JSON.stringify(keys.counts)
          )
            fetches += 1;
        });
        client.setQueryData(keys.counts, counts);
        const first = renderHook(() => useCounts(), { wrapper });
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
        expect(fetches).toBe(0);
        first.unmount();

        await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
        renderHook(() => useCounts(), { wrapper });
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetches).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
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

  it("shows a new category label at once, then moves its id everywhere before the refetch lands", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const { design, news } = seedLibrary(client);
    const renamed: Category = { ...design, id: "Design & UX", label: "Design & UX" };
    client.setQueryData<Counts>(keys.counts, { all: 3, feeds: {}, categories: { Design: 3 } });
    client.setQueryData<Preferences>(keys.preferences, {
      [CATEGORY_ORDER_KEY]: JSON.stringify(["News", "Design"]),
    });
    const patch = held();
    const refetch = held();
    server.use(
      http.patch("/api/categories/:id", async () => {
        await patch.wait;
        return HttpResponse.json(renamed);
      }),
      http.get("/api/categories", async () => {
        await refetch.wait;
        return HttpResponse.json([renamed, news]);
      }),
    );
    const { result } = renderHook(
      () => ({ categories: useCategories(), rename: useRenameCategory() }),
      { wrapper },
    );

    act(() => {
      result.current.rename.mutate({ categoryId: "Design", label: "Design & UX" });
    });
    await waitFor(() => {
      expect(client.getQueryData(keys.categories)).toEqual([
        { ...design, label: "Design & UX" },
        news,
      ]);
    });
    patch.release();
    await waitFor(() => {
      expect(result.current.rename.isSuccess).toBe(true);
    });

    expect(client.getQueryState(keys.categories)?.fetchStatus).toBe("fetching");
    expect(client.getQueryData(keys.categories)).toEqual([renamed, news]);
    expect(client.getQueryData<Feed[]>(keys.feeds)?.[0]?.categoryIds).toEqual(["Design & UX"]);
    expect(client.getQueryData<Counts>(keys.counts)?.categories).toEqual({ "Design & UX": 3 });
    expect(client.getQueryData<Preferences>(keys.preferences)?.[CATEGORY_ORDER_KEY]).toBe(
      JSON.stringify(["News", "Design & UX"]),
    );
    refetch.release();
  });

  it("restores the category label when the rename fails", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const { design, news } = seedLibrary(client);
    server.use(
      http.patch("/api/categories/:id", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useRenameCategory(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ categoryId: "Design", label: "Design & UX" })
        .catch(() => undefined);
    });

    expect(client.getQueryData(keys.categories)).toEqual([design, news]);
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
          return HttpResponse.json({ error: "boom" }, { status: 400 });
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
    await vi.waitFor(async () => {
      expect(await markReadStore.all()).toContain("101:a");
    });
    await act(async () => {
      await result.current.mutateAsync({ entryIds: ["101:a"], read: false });
      await markReadQueue.flush();
    });

    expect(reads).toEqual([]);
  });

  it("marks unread-only lists stale on mark-unread, refetching them on the next mount", async () => {
    const { client, wrapper } = setup();
    client.setDefaultOptions({ queries: { retry: false, staleTime: Infinity } });
    const key = keys.stream({ streamKey: "all", unreadOnly: true });
    let fetches = 0;
    client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "fetch") fetches += 1;
    });
    const list = renderHook(() => useStream({ streamKey: "all", unreadOnly: true }), { wrapper });
    await waitFor(() => {
      expect(list.result.current.isSuccess).toBe(true);
    });
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    const fetchesBefore = fetches;
    const entryId = flattenStream(list.result.current.data)[0]?.id ?? "";

    await act(async () => {
      await result.current.mutateAsync({ entryIds: [entryId], read: false });
    });

    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(fetches).toBe(fetchesBefore);

    list.unmount();
    renderHook(() => useStream({ streamKey: "all", unreadOnly: true }), { wrapper });
    await waitFor(() => {
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    });
    expect(fetches).toBe(fetchesBefore + 1);
  });

  it("keeps an unread-only list stale across a later optimistic mark", async () => {
    const { client, wrapper } = setup();
    client.setDefaultOptions({ queries: { retry: false, staleTime: Infinity } });
    const key = keys.stream({ streamKey: "all", unreadOnly: true });
    const list = renderHook(() => useStream({ streamKey: "all", unreadOnly: true }), { wrapper });
    await waitFor(() => {
      expect(list.result.current.isSuccess).toBe(true);
    });
    const [first, second] = flattenStream(list.result.current.data);
    const { result } = renderHook(() => useMarkRead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ entryIds: [first.id], read: false });
    });
    act(() => {
      result.current.mutate({ entryIds: [second.id], read: true });
    });
    await waitFor(() => {
      expect(flattenStream(client.getQueryData(key)).find((e) => e.id === second.id)?.unread).toBe(
        false,
      );
    });
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);

    list.unmount();
    renderHook(() => useStream({ streamKey: "all", unreadOnly: true }), { wrapper });
    await waitFor(() => {
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    });
  });

  it("sends a queued read before a list or the counts refetch, so neither shows it unread", async () => {
    const { client, wrapper } = setup();
    const allUnread = keys.stream({ streamKey: "all", unreadOnly: true });
    const { result } = renderHook(
      () => ({
        all: useStream({ streamKey: "all", unreadOnly: true }),
        counts: useCounts(),
        markRead: useMarkRead(),
      }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.all.isSuccess && result.current.counts.isSuccess).toBe(true);
    });
    const target = flattenStream(result.current.all.data)[0];
    const before = result.current.counts.data;
    const feed = renderHook(() => useStream({ streamKey: `feed:${target.feedId}` }), { wrapper });
    await waitFor(() => {
      expect(feed.result.current.isSuccess).toBe(true);
    });

    act(() => {
      result.current.markRead.mutate({ entryIds: [target.id], read: true });
    });
    await vi.waitFor(async () => {
      expect(await markReadStore.all()).toContain(target.id);
    });
    await act(async () => {
      await Promise.all(
        [allUnread, keys.counts].map(async (queryKey) =>
          client.refetchQueries({ queryKey, exact: true }),
        ),
      );
    });

    const refetched = flattenStream(client.getQueryData(allUnread));
    expect(refetched.some((item) => item.id === target.id && item.unread)).toBe(false);
    expect(client.getQueryData<Counts>(keys.counts)?.all).toBe((before?.all ?? 0) - 1);
    expect(client.getQueryData<Counts>(keys.counts)?.feeds[target.feedId]).toBe(
      (before?.feeds[target.feedId] ?? 0) - 1,
    );
  });

  it("lets a list fetch through after 3 s when a queued read never answers", async () => {
    vi.useFakeTimers();
    const flush = vi
      .spyOn(markReadQueue, "flush")
      .mockImplementation(async () => new Promise<void>(() => {}));
    try {
      const { wrapper } = setup();
      const { result } = renderHook(() => useStream({ streamKey: techKey }), { wrapper });

      await vi.advanceTimersByTimeAsync(2900);
      expect(result.current.fetchStatus).toBe("fetching");
      expect(result.current.isSuccess).toBe(false);
      await vi.advanceTimersByTimeAsync(2000);
      expect(result.current.isSuccess).toBe(true);
    } finally {
      flush.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps the decrement when a counts fetch was already in flight", async () => {
    const { client, wrapper } = setup();
    const stale = held();
    client.setQueryDefaults(keys.counts, {
      queryFn: async () => {
        await stale.wait;
        return counts;
      },
    });
    client.setQueryData(keys.stream({ streamKey: techKey }), page([entry({ id: "101:a" })]));
    client.setQueryData(keys.categories, seedCategories);
    client.setQueryData<Counts>(keys.counts, counts);
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    void client.refetchQueries({ queryKey: keys.counts });
    await waitFor(() => {
      expect(client.getQueryState(keys.counts)?.fetchStatus).toBe("fetching");
    });

    act(() => {
      result.current.mutate({ entryIds: ["101:a"], read: true });
    });
    await waitFor(() => {
      expect(client.getQueryData<Counts>(keys.counts)?.all).toBe(counts.all - 1);
    });
    stale.release();
    await act(async () => resolved(undefined));

    expect(client.getQueryData<Counts>(keys.counts)?.all).toBe(counts.all - 1);
  });

  it("removes the stored id before it calls markUnread", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    client.setQueryData(keys.stream({ streamKey: techKey }), page([entry({ id: "101:a" })]));
    await markReadStore.add(["101:a"]);
    let storedAtUnread: string[] | undefined;
    server.use(
      http.post("/api/entries/unread", async () => {
        storedAtUnread = await markReadStore.all();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = renderHook(() => useMarkRead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ entryIds: ["101:a"], read: false });
    });

    expect(storedAtUnread).toEqual([]);
  });

  it("stores a read marked while the network is offline", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const streamKey = keys.stream({ streamKey: techKey });
    client.setQueryData(streamKey, page([entry({ id: "101:a" })]));
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useMarkRead(), { wrapper });

    try {
      act(() => {
        result.current.mutate({ entryIds: ["101:a"], read: true });
      });
      await vi.waitFor(async () => {
        expect(await markReadStore.all()).toContain("101:a");
      });
      expect(flattenStream(client.getQueryData(streamKey))[0]?.unread).toBe(false);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("sends an unread marked offline once the network is back, without a rollback", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const streamKey = keys.stream({ streamKey: techKey });
    client.setQueryData(streamKey, page([{ ...entry({ id: "101:a" }), unread: false }]));
    const unreads: unknown[] = [];
    server.use(
      http.post("/api/entries/unread", async ({ request }) => {
        unreads.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useMarkRead(), { wrapper });

    try {
      act(() => {
        result.current.mutate({ entryIds: ["101:a"], read: false });
      });
      await vi.waitFor(() => {
        expect(flattenStream(client.getQueryData(streamKey))[0]?.unread).toBe(true);
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unreads).toEqual([]);

      await act(async () => {
        onlineManager.setOnline(true);
        await vi.waitFor(() => {
          expect(unreads).toHaveLength(1);
        });
      });
      await vi.waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      expect(flattenStream(client.getQueryData(streamKey))[0]?.unread).toBe(true);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("keeps an optimistic read when the send fails with a retryable status", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const streamKey = keys.stream({ streamKey: techKey });
    client.setQueryData(streamKey, page([entry({ id: "101:a" })]));
    server.use(
      http.post("/api/entries/read", () => HttpResponse.json({ error: "down" }, { status: 503 })),
    );
    const { result } = renderHook(() => useMarkRead(), { wrapper });

    await act(async () => {
      const settled = result.current.mutateAsync({ entryIds: ["101:a"], read: true });
      await vi.waitFor(async () => {
        expect(await markReadStore.all()).toContain("101:a");
      });
      await markReadQueue.flush();
      await settled;
    });

    expect(flattenStream(client.getQueryData(streamKey))[0]?.unread).toBe(false);
    expect(await markReadStore.all()).toEqual(["101:a"]);
  });

  it("rolls the entry back to unread when the read is dropped", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const streamKey = keys.stream({ streamKey: techKey });
    client.setQueryData(streamKey, page([entry({ id: "101:a" })]));
    server.use(
      http.post("/api/entries/read", () => HttpResponse.json({ error: "bad" }, { status: 400 })),
    );
    const { result } = renderHook(() => useMarkRead(), { wrapper });

    await act(async () => {
      const settled = result.current.mutateAsync({ entryIds: ["101:a"], read: true });
      const outcome = settled.catch(() => {});
      await vi.waitFor(async () => {
        expect(await markReadStore.all()).toContain("101:a");
      });
      await markReadQueue.flush();
      await outcome;
    });

    expect(flattenStream(client.getQueryData(streamKey))[0]?.unread).toBe(true);
    expect(await markReadStore.all()).toEqual([]);
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

  it("shows a feed's new title and categories in the feeds and categories before the PATCH resolves", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const { design, news, feed } = seedLibrary(client);
    const saved: Feed = { ...feed, title: "Renamed", categoryIds: ["News"] };
    const patch = held();
    server.use(
      http.patch("/api/feeds/:id", async () => {
        await patch.wait;
        return HttpResponse.json(saved);
      }),
    );
    const { result } = renderHook(() => useUpdateFeed(), { wrapper });

    act(() => {
      result.current.mutate({ feedId: "104", title: "Renamed", categoryIds: ["News"] });
    });

    await waitFor(() => {
      expect(client.getQueryData(keys.feeds)).toEqual([saved]);
    });
    expect(client.getQueryData(keys.categories)).toEqual([
      { ...design, feedIds: [] },
      { ...news, feedIds: ["104"] },
    ]);
    patch.release();
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(client.getQueryData(keys.feeds)).toEqual([saved]);
  });

  it("restores the feed and its categories when the PATCH fails", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const { design, news, feed } = seedLibrary(client);
    server.use(
      http.patch("/api/feeds/:id", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );
    const { result } = renderHook(() => useUpdateFeed(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({ feedId: "104", title: "Renamed", categoryIds: ["News"] })
        .catch(() => undefined);
    });

    expect(client.getQueryData(keys.feeds)).toEqual([feed]);
    expect(client.getQueryData(keys.categories)).toEqual([design, news]);
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
            return HttpResponse.json({ error: "boom" }, { status: 400 });
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

  describe("when checking isPremiumRequired", () => {
    it("is true only for a premium_required ApiError", () => {
      expect(isPremiumRequired(new ApiError({ status: 403, code: "premium_required" }))).toBe(true);
      expect(isPremiumRequired(new ApiError({ status: 401, code: "sign_in_required" }))).toBe(
        false,
      );
      expect(isPremiumRequired(new Error("nope"))).toBe(false);
    });
  });

  describe("when using the web feed hooks", () => {
    const pageUrl = "https://changelog.example.test/news";
    const fields = { storyContainer: "//article", title: ".//h2" };

    const analyze = async ({
      wrapper,
      url = pageUrl,
    }: {
      wrapper: ReturnType<typeof setup>["wrapper"];
      url?: string;
    }) => {
      const { result } = renderHook(() => useAnalyzeWebFeed(), { wrapper });
      let requestId: string | undefined;
      await act(async () => {
        requestId = (await result.current.mutateAsync({ url })).requestId;
      });
      return String(requestId);
    };

    it("polls an analysis from pending to done and stops", async () => {
      const { wrapper } = setup();
      const requestId = await analyze({ wrapper });

      const { result } = renderHook(() => useWebFeedStatus({ requestId }), { wrapper });

      await waitFor(() => {
        expect(result.current.data?.status).toBe("pending");
      });
      await waitFor(
        () => {
          expect(result.current.data?.status).toBe("done");
        },
        { timeout: 5000 },
      );
      expect(result.current.data?.variants.map((variant) => variant.label)).toEqual([
        "Release entries",
        "Sidebar links",
      ]);
      expect(result.current.timedOut).toBe(false);
      expect(result.current.isFetching).toBe(false);
    });

    it("ends in failure for the failing page", async () => {
      const { wrapper } = setup();
      const requestId = await analyze({ wrapper, url: "https://broken.example.test/page" });

      const { result } = renderHook(() => useWebFeedStatus({ requestId }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.data?.status).toBe("failed");
        },
        { timeout: 5000 },
      );
    });

    it("stays idle without a request id", () => {
      const { wrapper } = setup();

      const { result } = renderHook(() => useWebFeedStatus({ requestId: undefined }), { wrapper });

      expect(result.current.fetchStatus).toBe("idle");
      expect(result.current.timedOut).toBe(false);
    });

    it("gives up after 90 seconds on an id that never ends", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const { wrapper } = setup();

        const { result } = renderHook(() => useWebFeedStatus({ requestId: "unknown-request" }), {
          wrapper,
        });
        await waitFor(() => {
          expect(result.current.data?.status).toBe("pending");
        });
        expect(result.current.timedOut).toBe(false);

        await act(async () => vi.advanceTimersByTimeAsync(90_000));

        expect(result.current.timedOut).toBe(true);
        expect(result.current.fetchStatus).toBe("idle");
      } finally {
        vi.useRealTimers();
      }
    });

    it("subscribes through the hook and refreshes the library", async () => {
      const { client, wrapper } = setup();
      const before = renderHook(() => ({ feeds: useFeeds() }), { wrapper });
      await waitFor(() => {
        expect(before.result.current.feeds.data).toHaveLength(13);
      });

      const { result } = renderHook(() => useCreateWebFeed(), { wrapper });
      await act(async () => {
        await result.current.mutateAsync({
          url: pageUrl,
          variantIndex: 0,
          fields,
          categoryIds: ["News"],
        });
      });

      await waitFor(() => {
        expect(client.getQueryData<Feed[]>(keys.feeds)).toHaveLength(14);
      });
      expect(
        client.getQueryData<Feed[]>(keys.feeds)?.find((feed) => feed.id === "114"),
      ).toMatchObject({
        isWebFeed: true,
        categoryIds: ["News"],
      });
    });

    it("starts a reanalysis for a web feed with its page URL", async () => {
      const { wrapper } = setup();

      const { result } = renderHook(() => useReanalyzeWebFeed(), { wrapper });
      let answer: { requestId: string; url: string } | undefined;
      await act(async () => {
        answer = await result.current.mutateAsync({ feedId: "113" });
      });

      expect(answer?.url).toBe("https://changelog.example.test/releases");
      expect(answer?.requestId).toBeTruthy();
    });
  });
});
