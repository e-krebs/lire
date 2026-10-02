import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { globalAllStreamId } from "shared/feedsApi/streams";
import type {
  Entry,
  MarkerCounts,
  Preferences,
  StreamContents,
  Subscription,
} from "shared/feedsApi/types";
import { PreferencesSchema } from "shared/feedsApi/types";
import profileFixture from "fixtures/seed/profile.json";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";
import { seedCategoryId } from "test/seedCategories";
import { resetFixtureState } from "../adapters/fixture";
import { getCollections, getSubscriptions, postSubscription } from "../client";
import { CATEGORIES_ORDERING_KEY } from "../selectors";
import {
  DeleteAndMoveError,
  flattenStream,
  keys,
  useMarkRead,
  useCreateNewsletterAddress,
  useDeleteCategoryAndMove,
  usePreferences,
  useRefreshEntries,
  useReorderCategories,
  useSaveSubscription,
  useSearchContents,
  useStream,
  useSubscribeNewsletter,
} from "../queries";

const userId = profileFixture.id;
const techNewsStreamId = seedCategoryId("Tech News");

const setup = () => {
  vi.stubEnv("VITE_API_MODE", "mock");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

// The seeded Tech News category is a single page, so a second one is faked onto the cache.
const seedSecondPage = ({
  client,
  queryKey,
}: {
  client: QueryClient;
  queryKey: readonly unknown[];
}): void => {
  const firstPage = client.getQueryData<InfiniteData<StreamContents>>(queryKey)?.pages[0];
  if (!firstPage) throw new Error("the stream query cached no page to duplicate");
  client.setQueryData<InfiniteData<StreamContents>>(queryKey, {
    pages: [firstPage, { ...firstPage, items: [] }],
    pageParams: [undefined, "continuation-2"],
  });
};

const renderRefresh = () => {
  const { client, wrapper } = setup();
  const queryKey = keys.stream({ streamId: techNewsStreamId });
  const { result } = renderHook(
    () => ({ stream: useStream({ streamId: techNewsStreamId }), refresh: useRefreshEntries() }),
    { wrapper },
  );
  return { client, queryKey, result };
};

const categoryIdsOf = async (feedId: string): Promise<string[] | undefined> =>
  (await getSubscriptions())
    .find((subscription) => subscription.id === feedId)
    ?.categories.map((category) => category.id);

describe("queries", () => {
  it("flattens paginated stream data into a single entry list", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useStream({ streamId: techNewsStreamId }), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const entries = flattenStream(result.current.data);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => typeof entry.id === "string")).toBe(true);
  });

  it("returns only the entries matching the query", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useSearchContents({ streamId: techNewsStreamId, query: "chipmaker" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const entries = flattenStream(result.current.data);
    expect(entries.map((entry) => entry.id)).toEqual(["news-0029", "news-0001"]);
  });

  it("stays idle until the query is long enough", () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useSearchContents({ streamId: techNewsStreamId, query: " c " }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("optimistically flips the entry's unread flag in the cached stream page", async () => {
    const { wrapper } = setup();
    const { result: streamResult } = renderHook(() => useStream({ streamId: techNewsStreamId }), {
      wrapper,
    });
    await waitFor(() => {
      expect(streamResult.current.isSuccess).toBe(true);
    });

    const [firstEntry] = flattenStream(streamResult.current.data);
    expect(firstEntry).toBeDefined();

    const { result: mutationResult } = renderHook(() => useMarkRead(), { wrapper });
    act(() => {
      mutationResult.current.mutate({ entryIds: [firstEntry.id], read: true });
    });

    await waitFor(() => {
      const updated = flattenStream(streamResult.current.data).find(
        (entry) => entry.id === firstEntry.id,
      );
      expect(updated?.unread).toBe(false);
    });
  });

  it("counts a duplicate entry once even when it's cached under two streams", async () => {
    const { client, wrapper } = setup();
    const entryId = "dedupe-entry-1";
    const feedId = "feed/http://example-dedupe.test/rss";
    const globalId = globalAllStreamId(userId);

    const makeEntry = (): Entry => ({
      id: entryId,
      originId: "origin-dedupe",
      fingerprint: "fp-dedupe",
      title: "Dup entry",
      published: Date.now(),
      crawled: Date.now(),
      unread: true,
      origin: { streamId: feedId, title: "Dedupe Feed" },
    });

    const streamData: InfiniteData<StreamContents> = {
      pages: [{ id: "stub", updated: Date.now(), items: [makeEntry()] }],
      pageParams: [undefined],
    };
    // Same entry cached under two different stream queries (e.g. `global.all` and its category).
    client.setQueryData(keys.stream({ streamId: globalId }), streamData);
    client.setQueryData(keys.stream({ streamId: techNewsStreamId }), streamData);
    client.setQueryData(keys.entry(entryId), makeEntry());

    const counts: MarkerCounts = {
      updated: Date.now(),
      unreadcounts: [
        { id: feedId, count: 3, updated: Date.now() },
        { id: globalId, count: 5, updated: Date.now() },
      ],
    };
    client.setQueryData(keys.unreadCounts, counts);

    const { result } = renderHook(() => useMarkRead(), { wrapper });
    act(() => {
      result.current.mutate({ entryIds: [entryId], read: true });
    });

    await waitFor(() => {
      const updatedCounts = client.getQueryData<MarkerCounts>(keys.unreadCounts);
      expect(updatedCounts?.unreadcounts.find((entry) => entry.id === feedId)?.count).toBe(2);
      expect(updatedCounts?.unreadcounts.find((entry) => entry.id === globalId)?.count).toBe(4);
    });

    expect(client.getQueryData<Entry>(keys.entry(entryId))?.unread).toBe(false);
  });

  it("flips the unread flag in a cached search page too", async () => {
    const { client, wrapper } = setup();
    const entryId = "search-entry-1";
    const searchKey = keys.search({ streamId: techNewsStreamId, query: "tech" });
    client.setQueryData<InfiniteData<StreamContents>>(searchKey, {
      pages: [
        {
          id: "stub",
          updated: Date.now(),
          items: [
            {
              id: entryId,
              originId: "origin-search",
              fingerprint: "fp-search",
              title: "Tech entry",
              published: Date.now(),
              crawled: Date.now(),
              unread: true,
              origin: { streamId: "feed/http://example-search.test/rss", title: "Search Feed" },
            },
          ],
        },
      ],
      pageParams: [undefined],
    });

    const { result } = renderHook(() => useMarkRead(), { wrapper });
    act(() => {
      result.current.mutate({ entryIds: [entryId], read: true });
    });

    await waitFor(() => {
      const cached = client.getQueryData<InfiniteData<StreamContents>>(searchKey);
      expect(cached?.pages[0]?.items[0]?.unread).toBe(false);
    });
  });

  it("rolls back only the failed entry when a later mark succeeded", async () => {
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const makeEntry = (id: string): Entry => ({
      id,
      originId: `origin-${id}`,
      fingerprint: `fp-${id}`,
      title: id,
      published: Date.now(),
      crawled: Date.now(),
      unread: true,
      origin: { streamId: "feed/http://example-rollback.test/rss", title: "Rollback Feed" },
    });
    const streamKey = keys.stream({ streamId: techNewsStreamId });
    client.setQueryData<InfiniteData<StreamContents>>(streamKey, {
      pages: [{ id: "stub", updated: Date.now(), items: [makeEntry("a"), makeEntry("b")] }],
      pageParams: [undefined],
    });
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let posts = 0;
    server.use(
      http.post("/api/v3/markers", async () => {
        if (posts++ === 0) {
          await held;
          return HttpResponse.json({ error: "boom" }, { status: 500 });
        }
        return new HttpResponse("", { status: 200 });
      }),
    );

    const { result } = renderHook(() => ({ a: useMarkRead(), b: useMarkRead() }), { wrapper });
    let settled: Promise<unknown> = Promise.resolve();
    act(() => {
      settled = Promise.allSettled([
        result.current.a.mutateAsync({ entryIds: ["a"], read: true }),
        result.current.b.mutateAsync({ entryIds: ["b"], read: true }),
      ]);
    });
    await waitFor(() => {
      expect(posts).toBe(2);
    });
    release();
    await act(async () => settled);

    const unread = Object.fromEntries(
      flattenStream(client.getQueryData<InfiniteData<StreamContents>>(streamKey)).map((entry) => [
        entry.id,
        entry.unread,
      ]),
    );
    expect(unread).toEqual({ a: true, b: false });
  });

  it("trims the cache back to the first page and invalidates the unread counts", async () => {
    const { client, queryKey, result } = renderRefresh();
    await waitFor(() => {
      expect(result.current.stream.isSuccess).toBe(true);
    });

    seedSecondPage({ client, queryKey });
    expect(client.getQueryData<InfiniteData<StreamContents>>(queryKey)?.pages).toHaveLength(2);

    const counts: MarkerCounts = { updated: Date.now(), unreadcounts: [] };
    client.setQueryData(keys.unreadCounts, counts);

    await act(async () => {
      await result.current.refresh(queryKey);
    });

    const refreshed = client.getQueryData<InfiniteData<StreamContents>>(queryKey);
    expect(refreshed?.pages).toHaveLength(1);
    expect(refreshed?.pageParams).toHaveLength(1);
    expect(refreshed?.pages[0]?.items.length).toBeGreaterThan(0);
    expect(client.getQueryState(keys.unreadCounts)?.isInvalidated).toBe(true);
  });

  it("keeps the old rows in the cache while the first page is in flight", async () => {
    const { client, queryKey, result } = renderRefresh();
    await waitFor(() => {
      expect(result.current.stream.isSuccess).toBe(true);
    });

    seedSecondPage({ client, queryKey });
    const pending = result.current.refresh(queryKey);

    expect(
      client.getQueryData<InfiniteData<StreamContents>>(queryKey)?.pages[0]?.items.length,
    ).toBeGreaterThan(0);

    await act(async () => {
      await pending;
    });
  });

  it("refreshes the key it is handed", async () => {
    const { client, wrapper } = setup();
    const queryKey = keys.stream({ streamId: techNewsStreamId });
    const { result: streamResult } = renderHook(() => useStream({ streamId: techNewsStreamId }), {
      wrapper,
    });
    await waitFor(() => {
      expect(streamResult.current.isSuccess).toBe(true);
    });

    seedSecondPage({ client, queryKey });

    const { result } = renderHook(() => useRefreshEntries(), { wrapper });
    await act(async () => {
      await result.current(queryKey);
    });

    expect(client.getQueryData<InfiniteData<StreamContents>>(queryKey)?.pages).toHaveLength(1);
  });

  it("saves the title and the whole category set in one post", async () => {
    resetFixtureState();
    const { wrapper } = setup();
    const feedId = "feed/http://example-news.test/rss";
    const categoryIds = [seedCategoryId("Tech News"), seedCategoryId("Design")];
    const { result } = renderHook(() => useSaveSubscription(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ feedId, title: "Renamed News", categoryIds });
    });

    const saved = (await getSubscriptions()).find((subscription) => subscription.id === feedId);
    expect(saved?.title).toBe("Renamed News");
    expect(saved?.categories.map((category) => category.id)).toEqual(categoryIds);
  });

  it("moves the orphans to the target and deletes the category", async () => {
    resetFixtureState();
    const designId = seedCategoryId("Design");
    const archiveId = seedCategoryId("Archive");
    const designFeeds = [
      "feed/http://example-design.test/atom",
      "feed/http://example-typeface.test/rss",
      "feed/http://example-ux.test/feed",
    ];
    const { wrapper } = setup();
    const { result } = renderHook(() => useDeleteCategoryAndMove(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        categoryId: designId,
        targetId: archiveId,
        moveAll: false,
      });
    });

    for (const feedId of designFeeds) expect(await categoryIdsOf(feedId)).toEqual([archiveId]);
    expect((await getCollections()).some((collection) => collection.id === designId)).toBe(false);
  }, 10_000);

  it("also moves the feeds that sit in another category when moveAll is set", async () => {
    resetFixtureState();
    const designId = seedCategoryId("Design");
    const archiveId = seedCategoryId("Archive");
    const techNewsId = seedCategoryId("Tech News");
    const designFeeds = [
      "feed/http://example-design.test/atom",
      "feed/http://example-typeface.test/rss",
      "feed/http://example-ux.test/feed",
    ];
    const { wrapper } = setup();
    const sharedFeedId = "feed/http://example-news.test/rss";
    await postSubscription({ feedId: sharedFeedId, categoryIds: [techNewsId, designId] });
    const { result } = renderHook(() => useDeleteCategoryAndMove(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        categoryId: designId,
        targetId: archiveId,
        moveAll: true,
      });
    });

    expect(await categoryIdsOf(sharedFeedId)).toEqual([techNewsId, archiveId]);
    for (const feedId of designFeeds) expect(await categoryIdsOf(feedId)).toEqual([archiveId]);
  }, 10_000);

  it("stops at the first failed post, sends no delete, and reports how many moved", async () => {
    resetFixtureState();
    const designId = seedCategoryId("Design");
    const archiveId = seedCategoryId("Archive");
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const orphan = (id: string): Subscription => ({
      id,
      title: id,
      categories: [{ id: designId, label: "Design" }],
    });
    client.setQueryData<Subscription[]>(keys.subscriptions, [
      orphan("feed/one"),
      orphan("feed/two"),
      orphan("feed/three"),
    ]);
    let posts = 0;
    let deletes = 0;
    server.use(
      http.post("/api/v3/subscriptions", () => {
        posts += 1;
        return posts === 2
          ? HttpResponse.json({ error: "boom" }, { status: 500 })
          : new HttpResponse(null, { status: 200 });
      }),
      http.delete("/api/v3/collections/:id", () => {
        deletes += 1;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const { result } = renderHook(() => useDeleteCategoryAndMove(), { wrapper });

    let caught: unknown;
    await act(async () => {
      caught = await result.current
        .mutateAsync({ categoryId: designId, targetId: archiveId, moveAll: false })
        .catch((error: unknown) => error);
    });

    expect(caught).toBeInstanceOf(DeleteAndMoveError);
    expect(caught).toMatchObject({ moved: 1 });
    expect(posts).toBe(2);
    expect(deletes).toBe(0);
  });

  it("refuses the category being deleted as its own target, before any request", async () => {
    resetFixtureState();
    const designId = seedCategoryId("Design");
    const { wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    let requests = 0;
    server.use(
      http.all("/api/*", () => {
        requests += 1;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const { result } = renderHook(() => useDeleteCategoryAndMove(), { wrapper });

    let caught: unknown;
    await act(async () => {
      caught = await result.current
        .mutateAsync({ categoryId: designId, targetId: designId, moveAll: false })
        .catch((error: unknown) => error);
    });

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(DeleteAndMoveError);
    expect(requests).toBe(0);
  });

  it("creates a newsletter address without touching the caches", async () => {
    resetFixtureState();
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useCreateNewsletterAddress(), { wrapper });

    let address: { emailAddress: string; feedId: string } | undefined;
    await act(async () => {
      address = await result.current.mutateAsync();
    });

    expect(address?.emailAddress).toBe("fixture0001@newsletters.example");
    expect(client.isFetching()).toBe(0);
  });

  it("files a newsletter feed in every selected category and refreshes the subscriptions", async () => {
    resetFixtureState();
    const designId = seedCategoryId("Design");
    const feedId = "feed/https://newsletters.example/email/fixture0001";
    const { client, wrapper } = setup();
    const invalidate = client.invalidateQueries.bind(client);
    const invalidated: unknown[] = [];
    client.invalidateQueries = async (filters) => {
      invalidated.push(filters?.queryKey);
      return invalidate(filters);
    };
    const { result } = renderHook(() => useSubscribeNewsletter(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        feedId,
        title: "Weekly",
        categoryIds: [designId, techNewsStreamId],
      });
    });

    expect(await categoryIdsOf(feedId)).toEqual([designId, techNewsStreamId]);
    expect(invalidated).toContainEqual(keys.subscriptions);
  });

  it("errors but still refreshes the subscriptions when one category write fails", async () => {
    resetFixtureState();
    server.use(fixtureBackend);
    const designId = seedCategoryId("Design");
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const invalidate = client.invalidateQueries.bind(client);
    const invalidated: unknown[] = [];
    client.invalidateQueries = async (filters) => {
      invalidated.push(filters?.queryKey);
      return invalidate(filters);
    };
    const { result } = renderHook(() => useSubscribeNewsletter(), { wrapper });

    let caught: unknown;
    await act(async () => {
      caught = await result.current
        .mutateAsync({
          feedId: "feed/https://newsletters.example/email/fixture0001",
          title: "Weekly",
          categoryIds: [designId, "user/unknown/category/missing"],
        })
        .catch((error: unknown) => error);
    });

    expect(caught).toBeInstanceOf(Error);
    expect(invalidated).toContainEqual(keys.subscriptions);
  });

  it("writes the order as a JSON string into the preferences cache", async () => {
    const order = [seedCategoryId("Design"), seedCategoryId("Tech News")];
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useReorderCategories(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ categoryIds: order });
    });

    expect(client.getQueryData<Preferences>(keys.preferences)?.[CATEGORIES_ORDERING_KEY]).toBe(
      JSON.stringify(order),
    );
  });

  it("restores the previous order when the write fails", async () => {
    const order = [seedCategoryId("Design"), seedCategoryId("Tech News")];
    const { client, wrapper } = setup();
    vi.stubEnv("VITE_API_MODE", "real");
    const previous = JSON.stringify([seedCategoryId("Archive")]);
    client.setQueryData<Preferences>(keys.preferences, { [CATEGORIES_ORDERING_KEY]: previous });
    server.use(
      http.post("/api/v3/preferences", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );
    const { result } = renderHook(() => useReorderCategories(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ categoryIds: order }).catch(() => undefined);
    });

    expect(client.getQueryData<Preferences>(keys.preferences)?.[CATEGORIES_ORDERING_KEY]).toBe(
      previous,
    );
  });

  describe("when a second write lands while the first is in flight", () => {
    const order = [seedCategoryId("Design"), seedCategoryId("Tech News")];
    const firstIds = [seedCategoryId("Archive")];
    const secondIds = [seedCategoryId("Newsletters")];
    const second = JSON.stringify(secondIds);

    // A server that holds the first POST until released and answers each one from `outcomes`.
    const serve = ({ outcomes }: { outcomes: ("fail" | "save")[] }) => {
      const { client, wrapper } = setup();
      vi.stubEnv("VITE_API_MODE", "real");
      let store: Preferences = { [CATEGORIES_ORDERING_KEY]: JSON.stringify(order) };
      client.setQueryData<Preferences>(keys.preferences, store);
      let release = (): void => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const posts: Preferences[] = [];
      server.use(
        http.get("/api/v3/preferences", () => HttpResponse.json(store)),
        http.post("/api/v3/preferences", async ({ request }) => {
          const patch = PreferencesSchema.parse(await request.json());
          const index = posts.push(patch) - 1;
          if (index === 0) await held;
          if (outcomes[index] === "fail")
            return HttpResponse.json({ error: "boom" }, { status: 500 });
          store = { ...store, ...patch };
          return HttpResponse.json(store);
        }),
      );
      const { result } = renderHook(
        () => ({ a: useReorderCategories(), b: useReorderCategories(), prefs: usePreferences() }),
        { wrapper },
      );
      const cachedOrder = () =>
        client.getQueryData<Preferences>(keys.preferences)?.[CATEGORIES_ORDERING_KEY];
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
      expect(cachedOrder()).toBe(second);
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
