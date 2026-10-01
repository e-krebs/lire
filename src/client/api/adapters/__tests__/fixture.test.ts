import { beforeEach, describe, expect, it } from "vitest";
import { categoryStreamId, globalAllStreamId, globalReadStreamId } from "shared/feedsApi/streams";
import {
  CollectionSchema,
  MarkerCountsSchema,
  StreamContentsSchema,
  SubscriptionSchema,
} from "shared/feedsApi/types";
import { z } from "zod";
import profileFixture from "fixtures/seed/profile.json";
import { seedCategoryId } from "test/seedCategories";
import { fixtureTransport, resetFixtureState } from "../fixture";

const userId = profileFixture.id;
const techNewsStreamId = seedCategoryId("Tech News");
const designStreamId = seedCategoryId("Design");
const newslettersStreamId = seedCategoryId("Newsletters");
const techFeedId = "feed/http://example-tech.test/feed";

const getStreamCounts = async () => {
  const response = await fixtureTransport({ method: "GET", path: "/v3/markers/counts" });
  return MarkerCountsSchema.parse(await response.json());
};

const getSubscriptions = async () =>
  z
    .array(SubscriptionSchema)
    .parse(await (await fixtureTransport({ method: "GET", path: "/v3/subscriptions" })).json());

const countFor = ({
  counts,
  id,
}: {
  counts: Awaited<ReturnType<typeof getStreamCounts>>;
  id: string;
}): number => counts.unreadcounts.find((entry) => entry.id === id)?.count ?? 0;

describe("fixtureTransport", () => {
  // fixture.ts holds its live state (entriesPool, subscriptionsState) in module-level
  // singletons mutated by markers/subscriptions requests — a local `setup()` can't
  // recreate that, so this file uses the one `beforeEach` carve-out to undo it between tests.
  beforeEach(() => {
    resetFixtureState();
  });

  it("returns 404 for an unlisted path", async () => {
    const response = await fixtureTransport({ method: "GET", path: "/v3/not-a-real-endpoint" });

    expect(response.status).toBe(404);
  });

  it("filters a category stream by feed membership", async () => {
    const techNews = await fixtureTransport({
      method: "GET",
      path: "/v3/streams/contents",
      query: { streamId: techNewsStreamId, count: 100 },
    });
    const design = await fixtureTransport({
      method: "GET",
      path: "/v3/streams/contents",
      query: { streamId: designStreamId, count: 100 },
    });

    const techNewsBody = StreamContentsSchema.parse(await techNews.json());
    const designBody = StreamContentsSchema.parse(await design.json());

    expect(techNewsBody.items).toHaveLength(27);
    expect(designBody.items).toHaveLength(21);
    expect(designBody.items.some((item) => item.origin.streamId === techFeedId)).toBe(false);
  });

  it("pages a stream via the continuation token", async () => {
    const first = await fixtureTransport({
      method: "GET",
      path: "/v3/streams/contents",
      query: { streamId: techNewsStreamId, count: 10 },
    });
    const firstBody = StreamContentsSchema.parse(await first.json());
    expect(firstBody.items).toHaveLength(10);
    expect(firstBody.continuation).toBeDefined();

    const second = await fixtureTransport({
      method: "GET",
      path: "/v3/streams/contents",
      query: { streamId: techNewsStreamId, count: 100, continuation: firstBody.continuation },
    });
    const secondBody = StreamContentsSchema.parse(await second.json());
    expect(secondBody.items).toHaveLength(17);
    expect(secondBody.continuation).toBeUndefined();
  });

  it("scopes search results to the requested stream", async () => {
    const search = async (streamId: string) =>
      StreamContentsSchema.parse(
        await (
          await fixtureTransport({
            method: "GET",
            path: "/v3/search/contents",
            query: { streamId, query: "chipmaker", count: 100 },
          })
        ).json(),
      );

    const techNews = await search(techNewsStreamId);
    const design = await search(designStreamId);

    expect(techNews.id).toBe(techNewsStreamId);
    expect(techNews.items.map((item) => item.id)).toEqual(["news-0029", "news-0001"]);
    expect(design.items).toHaveLength(0);
  });

  it("matches the query against plain text, not markup", async () => {
    const response = await fixtureTransport({
      method: "GET",
      path: "/v3/search/contents",
      // Only ever present inside a tag in the fixture bodies (`<img …>`, `alt="illustrative …"`).
      query: { streamId: globalAllStreamId(userId), query: "illustrative", count: 100 },
    });

    expect(StreamContentsSchema.parse(await response.json()).items).toHaveLength(0);
  });

  it("matches on keywords and honours unreadOnly", async () => {
    // "typography" is a keyword on the typeface entries; none of their titles carry it.
    const all = StreamContentsSchema.parse(
      await (
        await fixtureTransport({
          method: "GET",
          path: "/v3/search/contents",
          query: { streamId: designStreamId, query: "TYPOGRAPHY", count: 100 },
        })
      ).json(),
    );
    const unread = StreamContentsSchema.parse(
      await (
        await fixtureTransport({
          method: "GET",
          path: "/v3/search/contents",
          query: { streamId: designStreamId, query: "typography", unreadOnly: true, count: 100 },
        })
      ).json(),
    );

    expect(all.items.every((item) => item.title?.toLowerCase().includes("typography"))).toBe(false);
    expect(all.items.map((item) => item.id)).toEqual([
      "typeface-0018",
      "typeface-0033",
      "typeface-0023",
      "typeface-0028",
    ]);
    expect(unread.items.map((item) => item.id)).toEqual([
      "typeface-0018",
      "typeface-0033",
      "typeface-0028",
    ]);
  });

  it("pages search results via the continuation token", async () => {
    const first = StreamContentsSchema.parse(
      await (
        await fixtureTransport({
          method: "GET",
          path: "/v3/search/contents",
          query: { streamId: designStreamId, query: "typography", count: 2 },
        })
      ).json(),
    );
    expect(first.items.map((item) => item.id)).toEqual(["typeface-0018", "typeface-0033"]);
    expect(first.continuation).toBeDefined();

    const second = StreamContentsSchema.parse(
      await (
        await fixtureTransport({
          method: "GET",
          path: "/v3/search/contents",
          query: {
            streamId: designStreamId,
            query: "typography",
            count: 2,
            continuation: first.continuation,
          },
        })
      ).json(),
    );
    expect(second.items.map((item) => item.id)).toEqual(["typeface-0023", "typeface-0028"]);
    expect(second.continuation).toBeUndefined();
  });

  it("answers 400 when search/contents gets no streamId or an empty query", async () => {
    const noStreamId = await fixtureTransport({
      method: "GET",
      path: "/v3/search/contents",
      query: { query: "chipmaker" },
    });
    const emptyQuery = await fixtureTransport({
      method: "GET",
      path: "/v3/search/contents",
      query: { streamId: techNewsStreamId, query: "   " },
    });

    expect(noStreamId.status).toBe(400);
    expect(await noStreamId.json()).toEqual({ error: "bad_request" });
    expect(emptyQuery.status).toBe(400);
  });

  it("marking an entry read decrements its feed, category and global counts", async () => {
    const before = await getStreamCounts();

    await fixtureTransport({
      method: "POST",
      path: "/v3/markers",
      body: { action: "markAsRead", type: "entries", entryIds: ["tech-0002"] },
    });

    const after = await getStreamCounts();

    expect(countFor({ counts: after, id: techFeedId })).toBe(
      countFor({ counts: before, id: techFeedId }) - 1,
    );
    expect(countFor({ counts: after, id: techNewsStreamId })).toBe(
      countFor({ counts: before, id: techNewsStreamId }) - 1,
    );
    expect(countFor({ counts: after, id: globalAllStreamId(userId) })).toBe(
      countFor({ counts: before, id: globalAllStreamId(userId) }) - 1,
    );
  });

  it("the recently-read stream lists read entries, last read first", async () => {
    const readStreamId = globalReadStreamId(userId);
    await fixtureTransport({
      method: "POST",
      path: "/v3/markers",
      body: { action: "markAsRead", type: "entries", entryIds: ["tech-0002"] },
    });

    const body = StreamContentsSchema.parse(
      await (
        await fixtureTransport({
          method: "GET",
          path: "/v3/streams/contents",
          query: { streamId: readStreamId, unreadOnly: true, count: 50 },
        })
      ).json(),
    );

    expect(body.items[0]?.id).toBe("tech-0002");
    expect(body.items.every((item) => !item.unread)).toBe(true);
  });

  it("markAsRead on a category clears every unread entry in it", async () => {
    await fixtureTransport({
      method: "POST",
      path: "/v3/markers",
      body: { action: "markAsRead", type: "categories", categoryIds: [designStreamId] },
    });

    const stillUnread = await fixtureTransport({
      method: "GET",
      path: "/v3/streams/contents",
      query: { streamId: designStreamId, unreadOnly: true, count: 100 },
    });
    const counts = await getStreamCounts();

    expect(StreamContentsSchema.parse(await stillUnread.json()).items).toHaveLength(0);
    expect(countFor({ counts, id: designStreamId })).toBe(0);
  });

  it("newsletter entries without `published` parse and sort by `crawled`", async () => {
    const response = await fixtureTransport({
      method: "GET",
      path: "/v3/streams/contents",
      query: { streamId: newslettersStreamId, count: 100 },
    });
    const body = StreamContentsSchema.parse(await response.json());

    expect(body.items).toHaveLength(6);
    expect(body.items.every((item) => item.published === undefined)).toBe(true);
    expect(body.items.every((item) => item.content?.direction === undefined)).toBe(true);
    const crawled = body.items.map((item) => item.crawled);
    expect(crawled).toEqual([...crawled].sort((a, b) => b - a));
  });

  it("subscribe, move and unsubscribe show up live in collections", async () => {
    const newFeedId = "feed/http://example-brandnew.test/rss";
    const brandNewCategoryId = categoryStreamId({ userId, label: "Brand New" });

    await fixtureTransport({
      method: "POST",
      path: "/v3/subscriptions",
      body: { id: newFeedId, title: "Brand New Feed", categories: [{ id: brandNewCategoryId }] },
    });
    const afterSubscribe = z
      .array(CollectionSchema)
      .parse(await (await fixtureTransport({ method: "GET", path: "/v3/collections" })).json());
    expect(
      afterSubscribe.find((c) => c.id === brandNewCategoryId)?.feeds.map((f) => f.id),
    ).toContain(newFeedId);

    await fixtureTransport({
      method: "POST",
      path: "/v3/subscriptions",
      body: { id: newFeedId, categories: [{ id: designStreamId }] },
    });
    const afterMove = z
      .array(CollectionSchema)
      .parse(await (await fixtureTransport({ method: "GET", path: "/v3/collections" })).json());
    expect(
      afterMove.find((c) => c.id === brandNewCategoryId)?.feeds.map((f) => f.id),
    ).not.toContain(newFeedId);
    expect(afterMove.find((c) => c.id === designStreamId)?.feeds.map((f) => f.id)).toContain(
      newFeedId,
    );

    await fixtureTransport({
      method: "DELETE",
      path: `/v3/subscriptions/${encodeURIComponent(newFeedId)}`,
    });
    const afterUnsubscribe = z
      .array(CollectionSchema)
      .parse(await (await fixtureTransport({ method: "GET", path: "/v3/collections" })).json());
    expect(
      afterUnsubscribe.find((c) => c.id === designStreamId)?.feeds.map((f) => f.id),
    ).not.toContain(newFeedId);
  });

  it("POST /v3/collections with no id creates a fresh category", async () => {
    const response = await fixtureTransport({
      method: "POST",
      path: "/v3/collections",
      body: { label: "Brand New Category" },
    });
    const [created] = z.array(CollectionSchema).parse(await response.json());

    expect(created.label).toBe("Brand New Category");
    expect(created.id).toBe(categoryStreamId({ userId, label: "Brand New Category" }));

    const collections = z
      .array(CollectionSchema)
      .parse(await (await fixtureTransport({ method: "GET", path: "/v3/collections" })).json());
    expect(collections.some((c) => c.id === created.id)).toBe(true);
  });

  it("POST /v3/collections with an existing id renames it in place", async () => {
    const response = await fixtureTransport({
      method: "POST",
      path: "/v3/collections",
      body: { id: designStreamId, label: "Design & UX" },
    });
    const [renamed] = z.array(CollectionSchema).parse(await response.json());

    expect(renamed.id).toBe(designStreamId);
    expect(renamed.label).toBe("Design & UX");

    const subscriptions = z
      .array(SubscriptionSchema)
      .parse(await (await fixtureTransport({ method: "GET", path: "/v3/subscriptions" })).json());
    const designFeed = subscriptions.find((sub) =>
      sub.categories.some((c) => c.id === designStreamId),
    );
    expect(designFeed?.categories.find((c) => c.id === designStreamId)?.label).toBe("Design & UX");
  });

  it("DELETE /v3/collections/:collectionId unsubscribes its orphans and strips it from the rest", async () => {
    const designFeedId = "feed/http://example-design.test/atom";
    await fixtureTransport({
      method: "POST",
      path: "/v3/subscriptions",
      body: { id: techFeedId, categories: [{ id: techNewsStreamId }, { id: designStreamId }] },
    });

    await fixtureTransport({
      method: "DELETE",
      path: `/v3/collections/${encodeURIComponent(designStreamId)}`,
    });

    const collections = z
      .array(CollectionSchema)
      .parse(await (await fixtureTransport({ method: "GET", path: "/v3/collections" })).json());
    expect(collections.some((c) => c.id === designStreamId)).toBe(false);
    const subscriptions = await getSubscriptions();
    expect(subscriptions.some((sub) => sub.id === designFeedId)).toBe(false);
    expect(subscriptions.find((sub) => sub.id === techFeedId)?.categories.map((c) => c.id)).toEqual(
      [techNewsStreamId],
    );
  });

  it("POST /v3/subscriptions with an empty set unsubscribes a followed feed", async () => {
    await fixtureTransport({
      method: "POST",
      path: "/v3/subscriptions",
      body: { id: techFeedId, categories: [] },
    });

    expect((await getSubscriptions()).some((sub) => sub.id === techFeedId)).toBe(false);
  });

  it("POST /v3/subscriptions with an empty set leaves an unfollowed feed unfollowed", async () => {
    const before = await getSubscriptions();

    await fixtureTransport({
      method: "POST",
      path: "/v3/subscriptions",
      body: { id: "feed/http://example-stranger.test/rss", title: "Stranger", categories: [] },
    });

    expect(await getSubscriptions()).toEqual(before);
  });

  it("POST /v3/feeds/newsletters returns a new address on every call", async () => {
    const first = await fixtureTransport({
      method: "POST",
      path: "/v3/feeds/newsletters",
      body: {},
    });
    const second = await fixtureTransport({
      method: "POST",
      path: "/v3/feeds/newsletters",
      body: {},
    });

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      emailAddress: "fixture0001@newsletters.example",
      feedId: "feed/https://newsletters.example/email/fixture0001",
    });
    expect(await second.json()).toMatchObject({ emailAddress: "fixture0002@newsletters.example" });
  });

  it("POST .../feeds/.mput files a new feed in the category with its title", async () => {
    const feedId = "feed/https://newsletters.example/email/fixture0001";

    const response = await fixtureTransport({
      method: "POST",
      path: `/v3/collections/${encodeURIComponent(designStreamId)}/feeds/.mput`,
      body: [{ id: feedId, title: "Weekly" }],
    });

    expect(response.status).toBe(200);
    const added = (await getSubscriptions()).find((sub) => sub.id === feedId);
    expect(added?.title).toBe("Weekly");
    expect(added?.categories.map((c) => c.id)).toEqual([designStreamId]);
    expect(added?.categories[0].label).toBe("Design");
  });

  it("POST .../feeds/.mput keeps the other categories of a followed feed", async () => {
    const before = (await getSubscriptions()).find((sub) => sub.id === techFeedId);
    const otherIds = before?.categories.map((c) => c.id) ?? [];
    expect(otherIds).not.toContain(newslettersStreamId);

    await fixtureTransport({
      method: "POST",
      path: `/v3/collections/${encodeURIComponent(newslettersStreamId)}/feeds/.mput`,
      body: [{ id: techFeedId }],
    });

    const after = (await getSubscriptions()).find((sub) => sub.id === techFeedId);
    expect(after?.categories.map((c) => c.id)).toEqual([...otherIds, newslettersStreamId]);
  });

  it("POST .../feeds/.mput answers 404 for an unknown category", async () => {
    const response = await fixtureTransport({
      method: "POST",
      path: `/v3/collections/${encodeURIComponent("user/u/category/nope")}/feeds/.mput`,
      body: [{ id: "feed/x" }],
    });

    expect(response.status).toBe(404);
  });
});
