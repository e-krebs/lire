import { z } from "zod";
import { describe, expect, it } from "vitest";
import { encodeCursor } from "../cursor";
import { FeedsAnswerSchema } from "../upstream";
import { FEEDS_ANSWER, fakeUpstream, memoryCache, send, story } from "test/bffHarness";

const feedsReply = { "GET /reader/feeds": FEEDS_ANSWER };

describe("handle reads", () => {
  it("answers the auth status as signed in", async () => {
    expect(await send({ url: "/api/auth/status", upstream: fakeUpstream({}) })).toEqual({
      status: 200,
      body: { signedIn: true },
    });
  });

  it("reads the profile from the social profile", async () => {
    const upstream = fakeUpstream({
      "GET /social/load_user_profile": { user_profile: { username: "ada", user_id: 42 } },
    });
    expect(await send({ url: "/api/profile", upstream })).toEqual({
      status: 200,
      body: { username: "ada" },
    });
  });

  describe("when the feed list is read", () => {
    it("fetches and caches the tree on a miss", async () => {
      const upstream = fakeUpstream(feedsReply);
      const cache = memoryCache();
      const response = await send({ url: "/api/feeds", upstream, cache });
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(4);
      expect(upstream.calls).toEqual([
        {
          method: "GET",
          path: "/reader/feeds",
          query: { flat: "false", include_favicons: "false", update_counts: "false" },
        },
      ]);
      expect(cache.value).toEqual(FeedsAnswerSchema.parse(FEEDS_ANSWER));
    });

    it("does not store a tree fetched before a write cleared the cache", async () => {
      const cache = memoryCache();
      const read = cache.get;
      // The write lands between the cache miss and the end of the fetch.
      const racing = {
        ...cache,
        get: async () => {
          const miss = await read();
          await cache.clear();
          return miss;
        },
      };
      await send({ url: "/api/feeds", upstream: fakeUpstream(feedsReply), cache: racing });
      expect(cache.value).toBeUndefined();
    });

    it("serves a cache hit without calling NewsBlur", async () => {
      const upstream = fakeUpstream({});
      const cache = memoryCache(FeedsAnswerSchema.parse(FEEDS_ANSWER));
      expect((await send({ url: "/api/feeds", upstream, cache })).status).toBe(200);
      expect(upstream.calls).toEqual([]);
    });
  });

  describe("when categories are read", () => {
    const withOrder = (payload: Record<string, unknown>) =>
      fakeUpstream({ ...feedsReply, "GET /profile/get_preference": { code: 1, payload } });
    const idsOf = async (payload: Record<string, unknown>) => {
      const { body } = await send({ url: "/api/categories", upstream: withOrder(payload) });
      return z
        .array(z.object({ id: z.string() }))
        .parse(body)
        .map((category) => category.id);
    };

    it("orders them by lire.categoryOrder, unknown ones last", async () => {
      expect(
        await idsOf({ "lire.categoryOrder": JSON.stringify(JSON.stringify(["News"])) }),
      ).toEqual(["News", "Tech", "Empty"]);
    });

    it("keeps tree order without a usable order", async () => {
      expect(await idsOf({})).toEqual(["Tech", "News", "Empty"]);
      expect(await idsOf({ "lire.categoryOrder": JSON.stringify("not json") })).toEqual([
        "Tech",
        "News",
        "Empty",
      ]);
      expect(await idsOf({ "lire.categoryOrder": JSON.stringify("{}") })).toEqual([
        "Tech",
        "News",
        "Empty",
      ]);
    });
  });

  it("sums ps + nt + ng per feed, per category and for all, over the tree only", async () => {
    const upstream = fakeUpstream({
      ...feedsReply,
      "GET /reader/refresh_feeds": {
        feeds: {
          "1": { ps: 1, nt: 2, ng: 3, id: 1 },
          "2": { ps: 0, nt: 4, ng: 0, id: 2 },
          "4": { ps: 0, nt: 1, ng: 0, id: 4 },
          "9": { ps: 0, nt: 50, ng: 0, id: 9 },
        },
      },
    });
    expect(await send({ url: "/api/counts", upstream })).toEqual({
      status: 200,
      body: {
        all: 11,
        feeds: { "1": 6, "2": 4, "3": 0, "4": 1 },
        categories: { Tech: 10, News: 4, Empty: 0 },
      },
    });
  });

  describe("when a stream is read", () => {
    const stories = { stories: [story()] };

    it("reads a feed from /reader/feed/:id and maps the entry", async () => {
      const upstream = fakeUpstream({ "GET /reader/feed/1": stories });
      const response = await send({
        url: "/api/streams/feed%3A1/entries?count=20&unreadOnly=true&order=oldest",
        upstream,
      });
      expect(response).toEqual({
        status: 200,
        body: {
          items: [
            {
              id: "1:abc",
              feedId: "1",
              title: "Hello",
              author: "Ada",
              content: "<p>Body</p>",
              published: 1_700_000_000_000,
              url: "https://a.example/hello",
              imageUrl: "https://a.example/1.png",
              unread: true,
            },
          ],
          cursor: encodeCursor({ page: 2 }),
        },
      });
      expect(upstream.calls[0].query).toEqual({
        page: "1",
        order: "oldest",
        read_filter: "unread",
        include_hidden: "true",
      });
    });

    it("maps a sparse story", async () => {
      const upstream = fakeUpstream({
        "GET /reader/feed/1": {
          stories: [
            {
              story_hash: "1:x",
              story_feed_id: 1,
              story_authors: "",
              story_timestamp: "1",
              read_status: 1,
            },
          ],
        },
      });
      const { body } = await send({ url: "/api/streams/feed%3A1/entries", upstream });
      expect(z.object({ items: z.array(z.unknown()) }).parse(body).items).toEqual([
        { id: "1:x", feedId: "1", published: 1000, unread: false },
      ]);
    });

    it("pages on the cursor and stops on an empty page", async () => {
      const upstream = fakeUpstream({ "GET /reader/feed/1": { stories: [] } });
      const cursor = encodeCursor({ page: 3 });
      expect(
        await send({ url: `/api/streams/feed%3A1/entries?cursor=${cursor}`, upstream }),
      ).toEqual({
        status: 200,
        body: { items: [] },
      });
      expect(upstream.calls[0].query).toMatchObject({
        page: "3",
        order: "newest",
        read_filter: "all",
      });
    });

    it("posts every feed in the tree for all", async () => {
      const upstream = fakeUpstream({ ...feedsReply, "POST /reader/river_stories": stories });
      await send({ url: "/api/streams/all/entries?count=5", upstream });
      expect(upstream.calls[1]).toEqual({
        method: "POST",
        path: "/reader/river_stories",
        form: {
          page: "1",
          order: "newest",
          limit: "5",
          read_filter: "all",
          include_hidden: "true",
          feeds: ["4", "1", "2", "3"],
        },
      });
    });

    it("posts a folder's feeds, nested ones included", async () => {
      const upstream = fakeUpstream({ ...feedsReply, "POST /reader/river_stories": stories });
      await send({ url: "/api/streams/folder%3ATech/entries", upstream });
      expect(upstream.calls[1].form?.feeds).toEqual(["1", "2", "3"]);
    });

    it("answers an empty folder without a river call", async () => {
      const upstream = fakeUpstream(feedsReply);
      expect(await send({ url: "/api/streams/folder%3AEmpty/entries", upstream })).toEqual({
        status: 200,
        body: { items: [] },
      });
      expect(upstream.calls).toHaveLength(1);
    });

    it("answers 404 for an unknown folder or stream key", async () => {
      const upstream = fakeUpstream(feedsReply);
      expect((await send({ url: "/api/streams/folder%3ANope/entries", upstream })).status).toBe(
        404,
      );
      expect((await send({ url: "/api/streams/feed%3Aabc/entries", upstream })).status).toBe(404);
    });

    it("reads the read stream from /reader/read_stories", async () => {
      const upstream = fakeUpstream({ "GET /reader/read_stories": stories });
      await send({ url: "/api/streams/read/entries?count=10", upstream });
      expect(upstream.calls[0].query).toEqual({ page: "1", order: "newest", limit: "10" });
    });

    it("rejects a bad query or cursor", async () => {
      const upstream = fakeUpstream({});
      const bad = await send({ url: "/api/streams/all/entries?count=0", upstream });
      expect(bad.status).toBe(400);
      expect(bad.body).toMatchObject({ error: "bad_request" });
      expect((await send({ url: "/api/streams/all/entries?cursor=%%", upstream })).status).toBe(
        400,
      );
      const searchCursor = encodeCursor({ page: 2, q: "x" });
      expect(
        (await send({ url: `/api/streams/all/entries?cursor=${searchCursor}`, upstream })).status,
      ).toBe(400);
    });
  });

  describe("when one entry is read", () => {
    it("fetches it by hash", async () => {
      const upstream = fakeUpstream({ "GET /reader/river_stories": { stories: [story()] } });
      const response = await send({ url: "/api/entries/1%3Aabc", upstream });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: "1:abc" });
      expect(upstream.calls[0].query).toEqual({ h: "1:abc", include_hidden: "true" });
    });

    it("answers 404 when NewsBlur has no such story", async () => {
      const upstream = fakeUpstream({ "GET /reader/river_stories": { stories: [] } });
      expect((await send({ url: "/api/entries/1%3Azzz", upstream })).status).toBe(404);
    });
  });

  describe("when entries are searched", () => {
    it("passes the query and keeps it in the cursor", async () => {
      const upstream = fakeUpstream({ "GET /reader/feed/1": { stories: [story()] } });
      const cursor = encodeCursor({ page: 2, q: "rust" });
      const response = await send({
        url: `/api/search/entries?streamKey=feed%3A1&q=rust&count=3&cursor=${cursor}`,
        upstream,
      });
      expect(response.body).toMatchObject({ cursor: encodeCursor({ page: 3, q: "rust" }) });
      expect(upstream.calls[0].query).toEqual({
        page: "2",
        order: "newest",
        query: "rust",
        read_filter: "all",
        include_hidden: "true",
      });
    });

    it("rejects a cursor from another query and an unknown stream", async () => {
      const upstream = fakeUpstream({});
      const cursor = encodeCursor({ page: 2, q: "go" });
      expect(
        (await send({ url: `/api/search/entries?streamKey=all&q=rust&cursor=${cursor}`, upstream }))
          .status,
      ).toBe(400);
      expect(
        (await send({ url: "/api/search/entries?streamKey=nope&q=rust", upstream })).status,
      ).toBe(400);
    });

    it("searches the read stream with unreadOnly", async () => {
      const upstream = fakeUpstream({ "GET /reader/read_stories": { stories: [] } });
      await send({ url: "/api/search/entries?streamKey=read&q=go&unreadOnly=true", upstream });
      expect(upstream.calls[0].query).toEqual({ page: "1", order: "newest", query: "go" });
    });
  });

  it("searches feeds through the autocomplete", async () => {
    const upstream = fakeUpstream({
      "GET /rss_feeds/feed_autocomplete": {
        feeds: [
          { id: 1, value: "https://a.example/feed", label: "Alpha", num_subscribers: 12 },
          { id: 2, value: "https://b.example/feed", label: "Beta" },
        ],
        term: "a",
      },
    });
    expect(await send({ url: "/api/search/feeds?q=a", upstream })).toEqual({
      status: 200,
      body: [
        { feedUrl: "https://a.example/feed", title: "Alpha", subscribers: 12 },
        { feedUrl: "https://b.example/feed", title: "Beta" },
      ],
    });
    expect(upstream.calls[0].query).toEqual({ term: "a", v: "2" });
  });

  it("keeps only decodable lire. preferences", async () => {
    const upstream = fakeUpstream({
      "GET /profile/get_preference": {
        code: 1,
        payload: {
          timezone: "Europe/Paris",
          "lire.directOpen.1": JSON.stringify("true"),
          "lire.deleted": "null",
          "lire.raw": "not json",
          "lire.flag": true,
          "lire.number": "5",
        },
      },
    });
    expect(await send({ url: "/api/preferences", upstream })).toEqual({
      status: 200,
      body: { "lire.directOpen.1": "true" },
    });
  });

  describe("when the newsletter address is read", () => {
    it("answers the configured address", async () => {
      expect(await send({ url: "/api/newsletter-address", upstream: fakeUpstream({}) })).toEqual({
        status: 200,
        body: { emailAddress: "demo-0000@newsletters.newsblur.com" },
      });
    });

    it("answers 404 when none is configured", async () => {
      const response = await send({
        url: "/api/newsletter-address",
        upstream: fakeUpstream({}),
        newsletterAddress: "",
      });
      expect(response.status).toBe(404);
    });
  });
});
