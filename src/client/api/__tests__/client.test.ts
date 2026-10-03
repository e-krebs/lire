import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "test/msw";
import { httpTransport } from "../adapters/http";
import {
  ApiError,
  deleteCategory,
  getAuthStatus,
  getCategories,
  getEntry,
  getNewsletterAddress,
  getProfile,
  getStreamEntries,
  markRead,
  searchEntries,
  updatePreferences,
} from "../client";

const setup = (): void => {
  vi.stubEnv("VITE_API_MODE", "real");
};

const entry = { id: "101:aa", feedId: "101", title: "One", published: 1, unread: true };

describe("client (http adapter)", () => {
  it("maps a 401 response to a sign_in_required ApiError", async () => {
    setup();
    server.use(
      http.get("/api/profile", () =>
        HttpResponse.json({ error: "sign_in_required" }, { status: 401 }),
      ),
    );

    await expect(getProfile()).rejects.toMatchObject(
      new ApiError({ status: 401, code: "sign_in_required" }),
    );
  });

  it("maps a 429 response to a rate_limited ApiError", async () => {
    setup();
    server.use(
      http.get("/api/profile", () => HttpResponse.json({ error: "rate_limited" }, { status: 429 })),
    );

    await expect(getProfile()).rejects.toMatchObject(
      new ApiError({ status: 429, code: "rate_limited" }),
    );
  });

  it("maps any other error status to an http ApiError", async () => {
    setup();
    server.use(
      http.get("/api/entries/:id", () =>
        HttpResponse.json({ error: "not_found" }, { status: 404 }),
      ),
    );

    await expect(getEntry("101:gone")).rejects.toMatchObject({ status: 404, code: "http" });
  });

  it("reads the seed through the baseline handlers", async () => {
    setup();

    await expect(getProfile()).resolves.toMatchObject({ username: "ada-reader" });
    expect((await getCategories()).map((category) => category.id)).toEqual([
      "Tech",
      "Design",
      "News",
      "Newsletters",
    ]);
  });

  it("encodes the stream key in the path and passes the paging params", async () => {
    setup();
    const seen: URL[] = [];
    server.use(
      http.get("/api/streams/:streamKey/entries", ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ items: [entry], cursor: "c2" });
      }),
    );

    const page = await getStreamEntries({
      streamKey: "folder:Tech & Co",
      count: 20,
      unreadOnly: true,
      order: "oldest",
      cursor: "c1",
    });

    expect(page).toEqual({ items: [entry], cursor: "c2" });
    expect(seen[0]?.pathname).toBe("/api/streams/folder%3ATech%20%26%20Co/entries");
    expect(Object.fromEntries(seen[0]?.searchParams ?? [])).toEqual({
      count: "20",
      unreadOnly: "true",
      order: "oldest",
      cursor: "c1",
    });
  });

  it("sends the search query as `q`, beside the stream key", async () => {
    setup();
    const seen: URLSearchParams[] = [];
    server.use(
      http.get("/api/search/entries", ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [entry] });
      }),
    );

    const page = await searchEntries({ streamKey: "all", query: "battery", unreadOnly: false });

    expect(page.items.map((item) => item.id)).toEqual(["101:aa"]);
    expect(Object.fromEntries(seen[0] ?? [])).toEqual({
      streamKey: "all",
      q: "battery",
      unreadOnly: "false",
    });
  });

  it("posts the ids and resolves on a 204 with no body", async () => {
    setup();
    const seen: unknown[] = [];
    server.use(
      http.post("/api/entries/read", async ({ request }) => {
        seen.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(markRead({ entryIds: ["101:aa"] })).resolves.toBeUndefined();
    expect(seen).toEqual([{ entryIds: ["101:aa"] }]);
  });

  it("sends a null preference value to delete the key", async () => {
    setup();
    const seen: unknown[] = [];
    server.use(
      http.post("/api/preferences", async ({ request }) => {
        seen.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await updatePreferences({ "lire.directOpen.101": null });

    expect(seen).toEqual([{ "lire.directOpen.101": null }]);
  });

  it("deletes a category by its encoded id, with the move target in the query", async () => {
    setup();
    const seen: URL[] = [];
    server.use(
      http.delete("/api/categories/:id", ({ request }) => {
        seen.push(new URL(request.url));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await deleteCategory({ categoryId: "Old news", moveTo: "News" });
    await deleteCategory({ categoryId: "Old news" });

    expect(seen.map((url) => `${url.pathname}${url.search}`)).toEqual([
      "/api/categories/Old%20news?moveTo=News",
      "/api/categories/Old%20news",
    ]);
  });

  it("reads the newsletter address", async () => {
    setup();
    server.use(
      http.get("/api/newsletter-address", () =>
        HttpResponse.json({ emailAddress: "a1@newsletters.example.test" }),
      ),
    );

    await expect(getNewsletterAddress()).resolves.toEqual({
      emailAddress: "a1@newsletters.example.test",
    });
  });

  it("reads the auth status, and counts any failure as signed out", async () => {
    setup();
    server.use(http.get("/api/auth/status", () => HttpResponse.json({ signedIn: true })));
    await expect(getAuthStatus()).resolves.toEqual({ signedIn: true });

    server.use(http.get("/api/auth/status", () => new HttpResponse(null, { status: 500 })));
    await expect(getAuthStatus()).resolves.toEqual({ signedIn: false });
  });

  it("answers signed in without a request in mock mode", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");

    await expect(getAuthStatus()).resolves.toEqual({ signedIn: true });
  });
  it("passes keepalive through to fetch in the http transport", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_url: URL, init: RequestInit) => {
      calls.push(init);
      return Promise.resolve(new Response(null, { status: 204 }));
    });

    const response = await httpTransport({
      method: "POST",
      path: "/api/entries/read",
      body: { entryIds: ["101:aa"] },
      keepalive: true,
    });

    expect(response.status).toBe(204);
    await expect(response.json()).resolves.toBeNull();
    expect(calls[0]).toMatchObject({ method: "POST", keepalive: true });
  });
});
