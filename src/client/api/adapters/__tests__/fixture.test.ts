import { beforeEach, describe, expect, it } from "vitest";
import {
  CategoriesSchema,
  CountsSchema,
  EntryPageSchema,
  FeedsSchema,
  NewsletterAddressSchema,
  PreferencesSchema,
} from "shared/feedsApi/types";
import type { TransportRequest } from "client/api/transport";
import { DEMO_NEWSLETTER_ADDRESS, fixtureTransport, resetFixtureState } from "../fixture";

const send = async (request: TransportRequest) => {
  const response = await fixtureTransport(request);
  return { status: response.status, body: await response.json() };
};

const get = async (path: string, query?: TransportRequest["query"]) =>
  (await send({ method: "GET", path, query })).body;

const entries = async (streamKey: string, query?: TransportRequest["query"]) =>
  EntryPageSchema.parse(
    await get(`/api/streams/${encodeURIComponent(streamKey)}/entries`, { count: 50, ...query }),
  );

const counts = async () => CountsSchema.parse(await get("/api/counts"));

describe("fixtureTransport", () => {
  // The fixture backend is module state that requests mutate — a local `setup()` can't recreate
  // it, so this file uses the one `beforeEach` carve-out to undo it between tests.
  beforeEach(() => {
    resetFixtureState();
  });

  it("returns 404 for a path outside the contract", async () => {
    expect(await send({ method: "GET", path: "/api/not-a-route" })).toEqual({
      status: 404,
      body: { error: "not_found" },
    });
  });

  it("serves the seed's top-level folders as categories, in the stored order", async () => {
    const categories = CategoriesSchema.parse(await get("/api/categories"));

    expect(categories.map((category) => category.id)).toEqual([
      "Tech",
      "Design",
      "News",
      "Newsletters",
    ]);
    expect(categories[0]?.feedIds).toEqual(["101", "102", "103"]);
  });

  it("scopes a folder stream to its feeds, nested folders included", async () => {
    const tech = await entries("folder:Tech");

    expect(tech.items).toHaveLength(17);
    expect(new Set(tech.items.map((item) => item.feedId))).toEqual(new Set(["101", "102", "103"]));
  });

  it("pages a stream through the cursor until an empty page", async () => {
    const first = await entries("folder:Tech", { count: 10 });
    expect(first.items).toHaveLength(10);
    expect(first.cursor).toBeDefined();

    const second = await entries("folder:Tech", { count: 10, cursor: first.cursor });
    expect(second.items).toHaveLength(7);

    const third = await entries("folder:Tech", { count: 10, cursor: second.cursor });
    expect(third).toEqual({ items: [] });
  });

  it("drops a read entry from its feed, folder and global counts", async () => {
    const before = await counts();

    const marked = await send({
      method: "POST",
      path: "/api/entries/read",
      body: { entryIds: ["101:0dcd64"] },
    });

    expect(marked.status).toBe(204);
    const after = await counts();
    expect(after.feeds["101"]).toBe((before.feeds["101"] ?? 0) - 1);
    expect(after.categories.Tech).toBe(before.categories.Tech - 1);
    expect(after.all).toBe(before.all - 1);
  });

  it("keeps a write for later reads, and forgets it on reset", async () => {
    const created = await send({
      method: "POST",
      path: "/api/feeds",
      body: { feedUrl: "https://gardening.example.test/rss", categoryIds: ["News"] },
    });
    expect(created.status).toBe(201);

    const titles = async () => FeedsSchema.parse(await get("/api/feeds")).map((feed) => feed.title);
    expect(await titles()).toContain("gardening.example.test");

    resetFixtureState();
    expect(await titles()).not.toContain("gardening.example.test");
  });

  it("stores the preferences across a reload, and drops a nulled key", async () => {
    await send({
      method: "POST",
      path: "/api/preferences",
      body: { "lire.directOpen.101": "visit", "lire.directOpen.106": null },
    });

    const stored = PreferencesSchema.parse(
      JSON.parse(window.localStorage.getItem("lire.fixture.preferences.v2") ?? "{}"),
    );
    expect(stored).toMatchObject({ "lire.directOpen.101": "visit" });
    expect(stored).not.toHaveProperty("lire.directOpen.106");
    expect(PreferencesSchema.parse(await get("/api/preferences"))).toEqual(stored);
  });

  it("answers the demo newsletter address", async () => {
    expect(NewsletterAddressSchema.parse(await get("/api/newsletter-address"))).toEqual({
      emailAddress: DEMO_NEWSLETTER_ADDRESS,
    });
  });

  it("answers a bad body with 400", async () => {
    const answer = await send({ method: "POST", path: "/api/entries/read", body: {} });

    expect(answer.status).toBe(400);
  });
});
