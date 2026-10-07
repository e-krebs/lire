import { describe, expect, it } from "vitest";
import { z } from "zod";
import { handle } from "shared/bff/handle";
import { memoryCache } from "test/bffHarness";
import { matchRoute } from "shared/feedsApi/routes";
import {
  AuthStatusSchema,
  CategoriesSchema,
  CountsSchema,
  EntryPageSchema,
  EntrySchema,
  FeedSearchResultsSchema,
  FeedsSchema,
  NewsletterAddressSchema,
  PreferencesSchema,
  ProfileSchema,
  WebFeedAnalysisSchema,
  WebFeedReanalysisSchema,
  WebFeedStatusSchema,
} from "shared/feedsApi/types";
import feedAutocomplete from "fixtures/seed/feed_autocomplete.json";
import feedsFixture from "fixtures/seed/feeds.json";
import preferences from "fixtures/seed/preferences.json";
import profile from "fixtures/seed/profile.json";
import readStories from "fixtures/seed/read_stories.json";
import refreshFeeds from "fixtures/seed/refresh_feeds.json";
import webfeedAnalyze from "fixtures/seed/webfeed_analyze.json";
import { createFakeNewsblur, FAKE_USER_ID, type FakeNewsblurFixtures } from "../fakeNewsblur";

const storyModules = import.meta.glob<{ default: unknown[] }>("/fixtures/seed/stories/*.json", {
  eager: true,
});
const stories = Object.fromEntries<unknown[]>(
  Object.entries(storyModules).map(([path, module]) => [
    String(path.split("/").at(-1)?.replace(".json", "")),
    module.default,
  ]),
);

const fixtures: FakeNewsblurFixtures = {
  feeds: feedsFixture,
  refreshFeeds,
  stories,
  readStories,
  feedAutocomplete,
  preferences,
  profile,
  webfeedAnalyze,
};

const setup = () => {
  const upstream = createFakeNewsblur({ fixtures });
  const cache = memoryCache();
  const send = async ({
    method = "GET",
    url,
    body,
  }: {
    method?: string;
    url: string;
    body?: unknown;
  }) => {
    const parsed = new URL(url, "https://lire.test");
    const match = matchRoute({ method, pathname: parsed.pathname });
    if (!match) throw new Error(`no route for ${method} ${url}`);
    return handle({
      route: match.route,
      params: match.params,
      query: parsed.searchParams,
      body,
      upstream,
      config: { newsletterAddress: "demo@newsletters.example.test", userId: FAKE_USER_ID },
      cache,
    });
  };
  return { send };
};

const parse = <S extends z.ZodType>({ schema, body }: { schema: S; body: unknown }) =>
  schema.parse(body);

describe("createFakeNewsblur through handle", () => {
  it("answers the read routes with S4-shaped bodies", async () => {
    const { send } = setup();
    expect((await send({ url: "/api/auth/status" })).body).toSatisfy(
      (b) => AuthStatusSchema.safeParse(b).success,
    );
    expect(
      parse({ schema: ProfileSchema, body: (await send({ url: "/api/profile" })).body }).username,
    ).toBe("ada-reader");

    const categories = parse({
      schema: CategoriesSchema,
      body: (await send({ url: "/api/categories" })).body,
    });
    expect(categories.map((c) => c.id)).toEqual(["Tech", "Design", "News", "Newsletters"]);

    const feeds = parse({ schema: FeedsSchema, body: (await send({ url: "/api/feeds" })).body });
    expect(feeds).toHaveLength(13);
    expect(feeds.filter((f) => f.isNewsletter)).toHaveLength(2);
    expect(feeds.filter((f) => f.isWebFeed).map((f) => f.id)).toEqual(["113"]);
    expect(feeds.find((f) => f.id === "103")?.categoryIds).toEqual(["Tech", "Design"]);

    const counts = parse({ schema: CountsSchema, body: (await send({ url: "/api/counts" })).body });
    expect(counts.feeds["101"]).toBe(7);

    expect(
      parse({ schema: PreferencesSchema, body: (await send({ url: "/api/preferences" })).body }),
    ).toEqual({
      "lire.categoryOrder": JSON.stringify(["Tech", "Design", "News", "Newsletters"]),
      "lire.directOpen.106": "visit",
    });
    expect(
      parse({
        schema: NewsletterAddressSchema,
        body: (await send({ url: "/api/newsletter-address" })).body,
      }),
    ).toEqual({ emailAddress: "demo@newsletters.example.test" });
    const search = parse({
      schema: FeedSearchResultsSchema,
      body: (await send({ url: "/api/search/feeds?q=garden" })).body,
    });
    expect(search.map((r) => r.title)).toEqual(["Example Gardening"]);
  });

  it("pages streams, filters unread and finds one entry", async () => {
    const { send } = setup();
    const first = parse({
      schema: EntryPageSchema,
      body: (await send({ url: "/api/streams/feed:101/entries" })).body,
    });
    expect(first.items).toHaveLength(6);
    const second = parse({
      schema: EntryPageSchema,
      body: (await send({ url: `/api/streams/feed:101/entries?cursor=${first.cursor}` })).body,
    });
    expect(second.items).toHaveLength(2);
    const oldest = parse({
      schema: EntryPageSchema,
      body: (await send({ url: "/api/streams/feed:101/entries?order=oldest" })).body,
    });
    expect(oldest.items[0].published).toBeLessThan(first.items[0].published);

    const all = parse({
      schema: EntryPageSchema,
      body: (await send({ url: "/api/streams/all/entries?count=5" })).body,
    });
    expect(all.items).toHaveLength(5);
    const folder = parse({
      schema: EntryPageSchema,
      body: (await send({ url: "/api/streams/folder:Newsletters/entries" })).body,
    });
    expect(folder.items.every((e) => ["111", "112"].includes(e.feedId))).toBe(true);
    const unreadOnly = parse({
      schema: EntryPageSchema,
      body: (await send({ url: "/api/streams/feed:101/entries?unreadOnly=true&count=20" })).body,
    });
    expect(unreadOnly.items.every((e) => e.unread)).toBe(true);
    const recent = parse({
      schema: EntryPageSchema,
      body: (await send({ url: "/api/streams/read/entries" })).body,
    });
    expect(recent.items.length).toBeGreaterThan(0);
    expect(recent.items.every((e) => !e.unread)).toBe(true);

    const entry = parse({
      schema: EntrySchema,
      body: (await send({ url: `/api/entries/${first.items[0].id}` })).body,
    });
    expect(entry.id).toBe(first.items[0].id);
    expect((await send({ url: "/api/entries/9:missing" })).status).toBe(404);

    const found = parse({
      schema: EntryPageSchema,
      body: (await send({ url: "/api/search/entries?streamKey=all&q=deliberately" })).body,
    });
    expect(found.items).toHaveLength(1);
  });

  it("keeps read state in memory", async () => {
    const { send } = setup();
    const page = parse({
      schema: EntryPageSchema,
      body: (await send({ url: "/api/streams/feed:106/entries" })).body,
    });
    const id = page.items[0].id;
    expect(
      (await send({ method: "POST", url: "/api/entries/mark", body: { read: [id] } })).status,
    ).toBe(204);
    expect(
      parse({ schema: EntrySchema, body: (await send({ url: `/api/entries/${id}` })).body }).unread,
    ).toBe(false);
    expect(
      parse({ schema: CountsSchema, body: (await send({ url: "/api/counts" })).body }).feeds["106"],
    ).toBe(4);
    expect(
      (await send({ method: "POST", url: "/api/entries/mark", body: { unread: [id] } })).status,
    ).toBe(204);
    expect(
      parse({ schema: CountsSchema, body: (await send({ url: "/api/counts" })).body }).feeds["106"],
    ).toBe(5);
  });

  it("keeps folder, feed and preference writes in memory", async () => {
    const { send } = setup();
    const created = await send({
      method: "POST",
      url: "/api/categories",
      body: { label: "Fresh" },
    });
    expect(created.status).toBe(201);
    expect(
      (await send({ method: "POST", url: "/api/categories", body: { label: "Fresh" } })).status,
    ).toBe(409);
    expect(
      (await send({ method: "PATCH", url: "/api/categories/Fresh", body: { label: "Renamed" } }))
        .status,
    ).toBe(200);

    const added = await send({
      method: "POST",
      url: "/api/feeds",
      body: {
        feedUrl: "https://new.example.test/feed",
        title: "New one",
        categoryIds: ["Renamed", "News"],
      },
    });
    expect(added.status).toBe(201);
    const newId = parse({ schema: FeedsSchema, body: [added.body] })[0].id;
    expect(
      (
        await send({
          method: "POST",
          url: "/api/feeds",
          body: { feedUrl: "nope", categoryIds: [] },
        })
      ).status,
    ).toBe(400);

    const patched = await send({
      method: "PATCH",
      url: `/api/feeds/${newId}`,
      body: { title: "Moved", categoryIds: ["Design"] },
    });
    expect(patched.status).toBe(200);
    expect(
      parse({ schema: FeedsSchema, body: (await send({ url: "/api/feeds" })).body }).find(
        (f) => f.id === newId,
      ),
    ).toMatchObject({
      title: "Moved",
      categoryIds: ["Design"],
    });

    expect((await send({ method: "DELETE", url: `/api/feeds/${newId}` })).status).toBe(204);
    expect((await send({ url: `/api/feeds/${newId}`, method: "PATCH", body: {} })).status).toBe(
      404,
    );
    expect((await send({ method: "DELETE", url: "/api/feeds/103" })).status).toBe(204);
    expect(
      parse({ schema: FeedsSchema, body: (await send({ url: "/api/feeds" })).body }),
    ).toHaveLength(12);

    expect((await send({ method: "DELETE", url: "/api/categories/Renamed" })).status).toBe(204);
    expect((await send({ method: "DELETE", url: "/api/categories/News?moveTo=Tech" })).status).toBe(
      204,
    );
    const feeds = parse({ schema: FeedsSchema, body: (await send({ url: "/api/feeds" })).body });
    expect(feeds.find((f) => f.id === "106")?.categoryIds).toEqual(["Tech"]);

    expect(
      (
        await send({
          method: "POST",
          url: "/api/preferences",
          body: { "lire.directOpen.7": "true", "lire.categoryOrder": null },
        })
      ).status,
    ).toBe(204);
    expect(
      parse({ schema: PreferencesSchema, body: (await send({ url: "/api/preferences" })).body }),
    ).toEqual({
      "lire.directOpen.106": "visit",
      "lire.directOpen.7": "true",
    });
  });

  describe("when handling web feeds", () => {
    const analyze = async ({
      send,
      url,
    }: {
      send: ReturnType<typeof setup>["send"];
      url: string;
    }) =>
      parse({
        schema: WebFeedAnalysisSchema,
        body: (await send({ method: "POST", url: "/api/webfeeds/analyze", body: { url } })).body,
      });
    const poll = async ({
      send,
      requestId,
    }: {
      send: ReturnType<typeof setup>["send"];
      requestId: string;
    }) =>
      parse({
        schema: WebFeedStatusSchema,
        body: (await send({ url: `/api/webfeeds/analyze/${requestId}` })).body,
      });

    it("answers pending on the first poll, then the seed variants", async () => {
      const { send } = setup();
      const { requestId } = await analyze({ send, url: "https://changelog.example.test/news" });
      expect(requestId).toBeDefined();
      const id = String(requestId);
      expect((await poll({ send, requestId: id })).status).toBe("pending");
      const done = await poll({ send, requestId: id });
      expect(done.status).toBe("done");
      expect(done.variants.map((v) => v.label)).toEqual(["Release entries", "Sidebar links"]);
      expect(done.htmlHash).toBe("3f9c1b7e5a2d");
    });

    it("ends one request id in failure", async () => {
      const { send } = setup();
      const { requestId } = await analyze({ send, url: "https://broken.example.test/page" });
      const id = String(requestId);
      expect((await poll({ send, requestId: id })).status).toBe("pending");
      expect((await poll({ send, requestId: id })).status).toBe("failed");
    });

    it("keeps an unknown id pending", async () => {
      const { send } = setup();
      expect((await poll({ send, requestId: "unknown-request" })).status).toBe("pending");
    });

    it("answers a feed address with no request id", async () => {
      const { send } = setup();
      expect(await analyze({ send, url: "https://changelog.example.test/feed" })).toEqual({
        feedUrl: "https://changelog.example.test/feed",
      });
    });

    it("subscribes as a web feed, then swaps the variant of a followed page", async () => {
      const { send } = setup();
      const url = "https://changelog.example.test/news";
      const fields = { storyContainer: "//article", title: ".//h2" };
      const body = { url, variantIndex: 0, fields, htmlHash: "abc", categoryIds: ["News"] };
      const first = await send({ method: "POST", url: "/api/webfeeds", body });
      expect(first.status).toBe(201);
      const feed = parse({ schema: FeedsSchema.element, body: first.body });
      expect(feed).toMatchObject({ isWebFeed: true, categoryIds: ["News"] });

      const again = await send({
        method: "POST",
        url: "/api/webfeeds",
        body: { ...body, variantIndex: 1, categoryIds: [] },
      });
      expect(again.status).toBe(200);
      expect(parse({ schema: FeedsSchema.element, body: again.body }).id).toBe(feed.id);
    });

    it("reanalyzes a web feed with a new request id and its page URL", async () => {
      const { send } = setup();
      const answer = parse({
        schema: WebFeedReanalysisSchema,
        body: (await send({ method: "POST", url: "/api/feeds/113/reanalyze" })).body,
      });
      expect(answer.url).toBe("https://changelog.example.test/releases");
      expect((await poll({ send, requestId: answer.requestId })).status).toBe("pending");
    });

    it("refuses to reanalyze a feed that is not a web feed", async () => {
      const { send } = setup();
      expect((await send({ method: "POST", url: "/api/feeds/101/reanalyze" })).status).toBe(400);
    });
  });
});
