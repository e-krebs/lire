import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "test/msw";
import {
  addFeedToCollection,
  ApiError,
  createNewsletterAddress,
  getProfile,
  markEntries,
  searchContents,
} from "../client";

const setup = (): void => {
  vi.stubEnv("VITE_API_MODE", "real");
};

describe("client (http adapter)", () => {
  it("maps a 401 response to a sign_in_required ApiError", async () => {
    setup();
    server.use(
      http.get("/api/v3/profile", () =>
        HttpResponse.json({ error: "unauthorized" }, { status: 401 }),
      ),
    );

    await expect(getProfile()).rejects.toMatchObject(
      new ApiError({ status: 401, code: "sign_in_required" }),
    );
  });

  it("maps a 429 response to a rate_limited ApiError", async () => {
    setup();
    server.use(
      http.get("/api/v3/profile", () =>
        HttpResponse.json({ error: "rate_limited" }, { status: 429 }),
      ),
    );

    await expect(getProfile()).rejects.toMatchObject(
      new ApiError({ status: 429, code: "rate_limited" }),
    );
  });

  it("passes the search params through and parses the stream response", async () => {
    setup();
    const seen: string[] = [];
    server.use(
      http.get("/api/v3/search/contents", ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({
          id: "user/u1/category/global.all",
          // Extra keys the live endpoint adds on top of the streams/contents shape.
          advancedSearch: true,
          direction: "ltr",
          items: [
            {
              id: "e1",
              originId: "o1",
              fingerprint: "f1",
              title: "Battery breakthrough",
              crawled: 1,
              unread: true,
              origin: { streamId: "feed/http://example.test/rss" },
            },
          ],
          continuation: "c1",
        });
      }),
    );

    const result = await searchContents({
      streamId: "user/u1/category/global.all",
      query: "battery",
      count: 20,
      unreadOnly: true,
    });

    expect(result.items.map((item) => item.id)).toEqual(["e1"]);
    expect(result.continuation).toBe("c1");
    expect(seen[0]).toContain("query=battery");
    expect(seen[0]).toContain("unreadOnly=true");
    expect(seen[0]).toContain("count=20");
  });

  it("resolves markEntries against a 200 response with an empty body", async () => {
    setup();
    server.use(http.post("/api/v3/markers", () => new HttpResponse("", { status: 200 })));

    await expect(markEntries({ entryIds: ["e1"], read: true })).resolves.toBeUndefined();
  });

  it("posts an empty JSON body to create a newsletter address", async () => {
    setup();
    const seen: unknown[] = [];
    server.use(
      http.post("/api/v3/feeds/newsletters", async ({ request }) => {
        seen.push(await request.json());
        return HttpResponse.json({ emailAddress: "a1@feedly.email", feedId: "feed/https://x/a1" });
      }),
    );

    await expect(createNewsletterAddress()).resolves.toMatchObject({
      emailAddress: "a1@feedly.email",
      feedId: "feed/https://x/a1",
    });
    expect(seen).toEqual([{}]);
  });

  it("posts the feed to the encoded collection path with .mput", async () => {
    setup();
    const seen: { pathname: string; body: unknown }[] = [];
    server.use(
      http.post("/api/v3/collections/:collectionId/feeds/.mput", async ({ request }) => {
        seen.push({ pathname: new URL(request.url).pathname, body: await request.json() });
        return new HttpResponse("", { status: 200 });
      }),
    );

    await expect(
      addFeedToCollection({ collectionId: "user/u1/category/c 1", feedId: "feed/f1", title: "F1" }),
    ).resolves.toBeUndefined();
    expect(seen).toEqual([
      {
        pathname: "/api/v3/collections/user%2Fu1%2Fcategory%2Fc%201/feeds/.mput",
        body: [{ id: "feed/f1", title: "F1" }],
      },
    ]);
  });
});
