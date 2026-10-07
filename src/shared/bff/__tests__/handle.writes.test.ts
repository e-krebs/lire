import { describe, expect, it } from "vitest";
import { FeedsAnswerSchema } from "../upstream";
import { FEEDS_ANSWER, fakeUpstream, memoryCache, send } from "test/bffHarness";

const OK = { code: 1 };
const cached = () => memoryCache(FeedsAnswerSchema.parse(FEEDS_ANSWER));

describe("handle writes", () => {
  describe("when a category is created", () => {
    it("adds a top-level folder and drops the cache", async () => {
      const upstream = fakeUpstream({ "POST /reader/add_folder": { code: 1, message: "" } });
      const cache = cached();
      const response = await send({
        method: "POST",
        url: "/api/categories",
        body: { label: "Rust" },
        upstream,
        cache,
      });
      expect(response).toEqual({ status: 201, body: { id: "Rust", label: "Rust", feedIds: [] } });
      expect(upstream.calls[0].form).toEqual({ folder: "Rust", parent_folder: "" });
      expect(cache.clears).toBe(1);
    });

    it("answers 409 when a category already has the label", async () => {
      const upstream = fakeUpstream({});
      const response = await send({
        method: "POST",
        url: "/api/categories",
        body: { label: "Tech" },
        upstream,
        cache: cached(),
      });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: "conflict" });
      expect(upstream.calls).toEqual([]);
    });

    it("rejects an empty label", async () => {
      const response = await send({
        method: "POST",
        url: "/api/categories",
        body: { label: "" },
        upstream: fakeUpstream({}),
      });
      expect(response.status).toBe(400);
    });
  });

  describe("when a category is renamed", () => {
    const order = (ids: string[]) => ({
      code: 1,
      payload: { "lire.categoryOrder": JSON.stringify(JSON.stringify(ids)) },
    });

    it("renames the top-level folder", async () => {
      const upstream = fakeUpstream({
        "POST /reader/rename_folder": {},
        "GET /profile/get_preference": { code: 1, payload: {} },
      });
      const response = await send({
        method: "PATCH",
        url: "/api/categories/News",
        body: { label: "Press" },
        upstream,
        cache: cached(),
      });
      expect(response).toEqual({
        status: 200,
        body: { id: "Press", label: "Press", feedIds: ["2", "3"] },
      });
      expect(upstream.calls[0].form).toEqual({
        folder_to_rename: "News",
        new_folder_name: "Press",
        in_folder: "",
      });
    });

    it("swaps the old id for the new label in the stored order, keeping its position", async () => {
      const upstream = fakeUpstream({
        "POST /reader/rename_folder": {},
        "GET /profile/get_preference": order(["Tech", "News", "Fun"]),
        "POST /profile/set_preference": OK,
      });
      await send({
        method: "PATCH",
        url: "/api/categories/News",
        body: { label: "Press" },
        upstream,
        cache: cached(),
      });
      expect(upstream.calls.at(-1)?.form).toEqual({
        "lire.categoryOrder": JSON.stringify(JSON.stringify(["Tech", "Press", "Fun"])),
      });
    });

    it("leaves the stored order alone when the renamed id is not in it", async () => {
      const upstream = fakeUpstream({
        "POST /reader/rename_folder": {},
        "GET /profile/get_preference": order(["Tech"]),
      });
      await send({
        method: "PATCH",
        url: "/api/categories/News",
        body: { label: "Press" },
        upstream,
        cache: cached(),
      });
      expect(upstream.calls.map((call) => call.path)).toEqual([
        "/reader/rename_folder",
        "/profile/get_preference",
      ]);
    });

    it("answers 409 when another category already has the label", async () => {
      const upstream = fakeUpstream({});
      const response = await send({
        method: "PATCH",
        url: "/api/categories/News",
        body: { label: "Tech" },
        upstream,
        cache: cached(),
      });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: "conflict" });
      expect(upstream.calls).toEqual([]);
    });

    it("does not treat a rename to the same label as a conflict", async () => {
      const upstream = fakeUpstream({
        "POST /reader/rename_folder": {},
        "GET /profile/get_preference": order(["News"]),
      });
      const response = await send({
        method: "PATCH",
        url: "/api/categories/News",
        body: { label: "News" },
        upstream,
        cache: cached(),
      });
      expect(response.status).toBe(200);
      expect(upstream.calls.map((call) => call.path)).not.toContain("/profile/set_preference");
    });

    it("answers 404 for an unknown category", async () => {
      const response = await send({
        method: "PATCH",
        url: "/api/categories/Nope",
        body: { label: "X" },
        upstream: fakeUpstream({}),
        cache: cached(),
      });
      expect(response.status).toBe(404);
    });
  });

  describe("when a category is deleted", () => {
    const upstream = () =>
      fakeUpstream({ "POST /reader/move_feed_to_folders": OK, "POST /reader/delete_folder": OK });

    it("moves out the feeds that sit nowhere else, then deletes the folder", async () => {
      const fake = upstream();
      const response = await send({
        method: "DELETE",
        url: "/api/categories/Tech",
        upstream: fake,
        cache: cached(),
      });
      expect(response).toEqual({ status: 204, body: null });
      expect(fake.calls.map((call) => [call.path, call.form])).toEqual([
        [
          "/reader/move_feed_to_folders",
          {
            feed_id: "1",
            in_folders: ["Tech"],
            to_folders: [""],
            in_folder_paths: JSON.stringify([["Tech"]]),
            to_folder_paths: JSON.stringify([[]]),
          },
        ],
        ["/reader/delete_folder", { folder_to_delete: "Tech", in_folder: "" }],
      ]);
    });

    it("moves feeds into moveTo unless they already sit there", async () => {
      const fake = upstream();
      await send({
        method: "DELETE",
        url: "/api/categories/Tech?moveTo=News",
        upstream: fake,
        cache: cached(),
      });
      expect(fake.calls.map((call) => call.form?.feed_id ?? call.path)).toEqual([
        "1",
        "/reader/delete_folder",
      ]);
      expect(fake.calls[0].form?.to_folder_paths).toBe(JSON.stringify([["News"]]));
    });

    it("rejects a moveTo that is the same or unknown", async () => {
      for (const moveTo of ["Tech", "Nope"]) {
        const response = await send({
          method: "DELETE",
          url: `/api/categories/Tech?moveTo=${moveTo}`,
          upstream: upstream(),
          cache: cached(),
        });
        expect(response.status).toBe(400);
      }
    });

    it("keeps the folder when a move fails, and still drops the cache", async () => {
      const fake = fakeUpstream({
        "POST /reader/move_feed_to_folders": { code: -1, message: "That feed has moved." },
      });
      const cache = cached();
      const response = await send({
        method: "DELETE",
        url: "/api/categories/Tech",
        upstream: fake,
        cache,
      });
      expect(response).toEqual({
        status: 400,
        body: { error: "bad_request", message: "That feed has moved." },
      });
      expect(fake.calls).toHaveLength(1);
      expect(cache.clears).toBe(1);
    });
  });

  describe("when a feed is subscribed", () => {
    const added = {
      code: 1,
      message: "",
      feed: { id: 8, feed_title: "Gamma", feed_address: "https://g.example/feed" },
    };

    it("adds it to the first folder, renames it and adds the other folders", async () => {
      const upstream = fakeUpstream({
        "POST /reader/add_url": added,
        "POST /reader/rename_feed": OK,
        "POST /reader/move_feed_to_folders": OK,
      });
      const response = await send({
        method: "POST",
        url: "/api/feeds",
        body: { feedUrl: "https://g.example", title: "G", categoryIds: ["Tech", "News", "Tech"] },
        upstream,
      });
      expect(response).toEqual({
        status: 201,
        body: {
          id: "8",
          title: "G",
          feedUrl: "https://g.example/feed",
          categoryIds: ["Tech", "News"],
          isNewsletter: false,
        },
      });
      expect(upstream.calls.map((call) => call.form)).toEqual([
        { url: "https://g.example", folder: "Tech" },
        { feed_id: "8", feed_title: "G" },
        {
          feed_id: "8",
          in_folders: [],
          to_folders: ["News"],
          in_folder_paths: "[]",
          to_folder_paths: JSON.stringify([["News"]]),
        },
      ]);
    });

    it("adds it at the top level with no category", async () => {
      const upstream = fakeUpstream({ "POST /reader/add_url": added });
      const response = await send({
        method: "POST",
        url: "/api/feeds",
        body: { feedUrl: "https://g.example", categoryIds: [] },
        upstream,
      });
      expect(response.body).toMatchObject({ title: "Gamma", categoryIds: [] });
      expect(upstream.calls[0].form).toEqual({ url: "https://g.example", folder: "" });
    });

    it("answers 400 with NewsBlur's message on a rejected URL", async () => {
      const upstream = fakeUpstream({
        "POST /reader/add_url": { code: -1, message: "The publisher has banned NewsBlur." },
      });
      const response = await send({
        method: "POST",
        url: "/api/feeds",
        body: { feedUrl: "https://x.example", categoryIds: [] },
        upstream,
      });
      expect(response).toEqual({
        status: 400,
        body: { error: "bad_request", message: "The publisher has banned NewsBlur." },
      });
    });

    it("answers 502 when a success carries no feed", async () => {
      const upstream = fakeUpstream({ "POST /reader/add_url": { code: 1, feed: null } });
      const response = await send({
        method: "POST",
        url: "/api/feeds",
        body: { feedUrl: "https://x.example", categoryIds: [] },
        upstream,
      });
      expect(response.status).toBe(502);
    });
  });

  describe("when a feed is updated", () => {
    const patch = async (feedId: string, body: unknown) => {
      const upstream = fakeUpstream({
        "POST /reader/rename_feed": OK,
        "POST /reader/move_feed_to_folders": OK,
      });
      const response = await send({
        method: "PATCH",
        url: `/api/feeds/${feedId}`,
        body,
        upstream,
        cache: cached(),
      });
      return { response, forms: upstream.calls.map((call) => call.form) };
    };

    it("renames it", async () => {
      const { response, forms } = await patch("1", { title: "A" });
      expect(response.body).toMatchObject({ id: "1", title: "A", categoryIds: ["Tech"] });
      expect(forms).toEqual([{ feed_id: "1", feed_title: "A" }]);
    });

    it("keeps a nested placement in a category it stays in and moves the rest", async () => {
      const { response, forms } = await patch("2", { categoryIds: ["Tech", "Empty"] });
      expect(response.body).toMatchObject({ title: "Beta", categoryIds: ["Tech", "Empty"] });
      expect(forms).toEqual([
        {
          feed_id: "2",
          in_folders: ["News"],
          to_folders: ["Empty"],
          in_folder_paths: JSON.stringify([["News"]]),
          to_folder_paths: JSON.stringify([["Empty"]]),
        },
      ]);
    });

    it("moves it to the top level with no category", async () => {
      const { forms } = await patch("1", { categoryIds: [] });
      expect(forms[0]).toMatchObject({
        in_folder_paths: JSON.stringify([["Tech"]]),
        to_folder_paths: JSON.stringify([[]]),
      });
    });

    it("makes no call when nothing changes", async () => {
      expect((await patch("4", { categoryIds: [] })).forms).toEqual([]);
      expect((await patch("1", { categoryIds: ["Tech"] })).forms).toEqual([]);
    });

    it("answers 404 for a feed outside the tree", async () => {
      expect((await patch("9", { title: "X" })).response.status).toBe(404);
    });
  });

  describe("when a feed is unsubscribed", () => {
    it("deletes each placement by its folder path", async () => {
      const upstream = fakeUpstream({ "POST /reader/delete_feed": OK });
      const cache = cached();
      const response = await send({ method: "DELETE", url: "/api/feeds/2", upstream, cache });
      expect(response.status).toBe(204);
      expect(upstream.calls.map((call) => call.form)).toEqual([
        { feed_id: "2", in_folder: "Deep", folder_path: JSON.stringify(["Tech", "Deep"]) },
        { feed_id: "2", in_folder: "News", folder_path: JSON.stringify(["News"]) },
      ]);
      expect(cache.clears).toBe(1);
    });

    it("names the top level as an empty folder", async () => {
      const upstream = fakeUpstream({ "POST /reader/delete_feed": OK });
      await send({ method: "DELETE", url: "/api/feeds/4", upstream, cache: cached() });
      expect(upstream.calls[0].form).toEqual({ feed_id: "4", in_folder: "", folder_path: "[]" });
    });
  });

  describe("when entries are marked", () => {
    it("marks every hash read in one call", async () => {
      const upstream = fakeUpstream({ "POST /reader/mark_story_hashes_as_read": OK });
      const response = await send({
        method: "POST",
        url: "/api/entries/read",
        body: { entryIds: ["1:a", "2:b"] },
        upstream,
      });
      expect(response.status).toBe(204);
      expect(upstream.calls[0].form).toEqual({ story_hash: ["1:a", "2:b"] });
    });

    it("marks each hash unread in its own call", async () => {
      const upstream = fakeUpstream({ "POST /reader/mark_story_hash_as_unread": OK });
      await send({
        method: "POST",
        url: "/api/entries/unread",
        body: { entryIds: ["1:a", "2:b"] },
        upstream,
      });
      expect(upstream.calls.map((call) => call.form)).toEqual([
        { story_hash: "1:a" },
        { story_hash: "2:b" },
      ]);
    });

    it("sends the read call before the unread calls on the merged route", async () => {
      const upstream = fakeUpstream({
        "POST /reader/mark_story_hashes_as_read": OK,
        "POST /reader/mark_story_hash_as_unread": OK,
      });
      const response = await send({
        method: "POST",
        url: "/api/entries/mark",
        body: { unread: ["3:c", "4:d"], read: ["1:a", "2:b"] },
        upstream,
      });
      expect(response.status).toBe(204);
      expect(upstream.calls.map((call) => [call.path, call.form])).toEqual([
        ["/reader/mark_story_hashes_as_read", { story_hash: ["1:a", "2:b"] }],
        ["/reader/mark_story_hash_as_unread", { story_hash: "3:c" }],
        ["/reader/mark_story_hash_as_unread", { story_hash: "4:d" }],
      ]);
    });

    it("skips the read call when the merged route has only unreads", async () => {
      const upstream = fakeUpstream({ "POST /reader/mark_story_hash_as_unread": OK });
      const response = await send({
        method: "POST",
        url: "/api/entries/mark",
        body: { unread: ["3:c"] },
        upstream,
      });
      expect(response.status).toBe(204);
      expect(upstream.calls).toHaveLength(1);
    });

    it.for([{}, { read: [], unread: [] }])("rejects the merged route body %o", async (body) => {
      const upstream = fakeUpstream({});
      const response = await send({ method: "POST", url: "/api/entries/mark", body, upstream });
      expect(response.status).toBe(400);
      expect(upstream.calls).toHaveLength(0);
    });

    it("stops the merged route at the first upstream failure", async () => {
      const upstream = fakeUpstream({
        "POST /reader/mark_story_hashes_as_read": { code: 0 },
        "POST /reader/mark_story_hash_as_unread": OK,
      });
      const response = await send({
        method: "POST",
        url: "/api/entries/mark",
        body: { read: ["1:a"], unread: ["3:c"] },
        upstream,
      });
      expect(response.status).toBe(400);
      expect(upstream.calls).toHaveLength(1);
    });

    it("answers 400 on a write that fails with HTTP 200", async () => {
      const upstream = fakeUpstream({
        "POST /reader/mark_story_hashes_as_read": {
          code: 1,
          errors: ["Not subscribed.", "Twice."],
        },
      });
      const response = await send({
        method: "POST",
        url: "/api/entries/read",
        body: { entryIds: ["1:a"] },
        upstream,
      });
      expect(response.body).toEqual({ error: "bad_request", message: "Not subscribed. Twice." });
    });

    it("falls back to a generic message", async () => {
      const upstream = fakeUpstream({ "POST /reader/mark_story_hash_as_unread": { code: 0 } });
      const response = await send({
        method: "POST",
        url: "/api/entries/unread",
        body: { entryIds: ["1:a"] },
        upstream,
      });
      expect(response.body).toEqual({
        error: "bad_request",
        message: "NewsBlur rejected the request.",
      });
    });
  });

  describe("when preferences are written", () => {
    it("JSON-encodes each value and writes null as the string null", async () => {
      const upstream = fakeUpstream({ "POST /profile/set_preference": OK });
      const response = await send({
        method: "POST",
        url: "/api/preferences",
        body: { "lire.directOpen.1": "true", "lire.categoryOrder": null },
        upstream,
      });
      expect(response.status).toBe(204);
      expect(upstream.calls[0].form).toEqual({
        "lire.directOpen.1": '"true"',
        "lire.categoryOrder": "null",
      });
    });

    it("makes no call for an empty update", async () => {
      const upstream = fakeUpstream({});
      const response = await send({ method: "POST", url: "/api/preferences", body: {}, upstream });
      expect(response.status).toBe(204);
      expect(upstream.calls).toEqual([]);
    });

    it("rejects a key Lire does not own", async () => {
      const response = await send({
        method: "POST",
        url: "/api/preferences",
        body: { timezone: "UTC" },
        upstream: fakeUpstream({}),
      });
      expect(response.status).toBe(400);
    });
  });
});
