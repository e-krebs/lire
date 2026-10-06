import { describe, expect, it } from "vitest";
import { FeedsAnswerSchema } from "../upstream";
import { FEEDS_ANSWER, fakeUpstream, memoryCache, send } from "test/bffHarness";

const WEB_FEED = {
  id: 5,
  feed_title: "Shop news",
  feed_address: "webfeed:https://w.example/news",
  feed_link: "https://w.example/news",
  is_webfeed: true,
};

const cached = () =>
  memoryCache(
    FeedsAnswerSchema.parse({
      feeds: { ...FEEDS_ANSWER.feeds, "5": WEB_FEED },
      folders: [5, ...FEEDS_ANSWER.folders],
    }),
  );

const VARIANTS_DATA = {
  variants: [
    {
      label: "Main article list",
      description: "The news cards",
      story_container: "//div[contains(@class,'card')]",
      title: ".//h2/a/text()",
      link: ".//h2/a/@href",
      content: ".//p/text()",
      image: null,
      author: null,
      date: ".//time/text()",
      preview_stories: [
        {
          title: "Spring sale",
          link: "https://w.example/news/1",
          content: "Up to 30%",
          image: null,
        },
      ],
    },
  ],
  html_hash: "abc123",
  page_title: "Shop | News",
  favicon_url: null,
};

const FIELDS = {
  storyContainer: "//div[contains(@class,'card')]",
  title: ".//h2/a/text()",
  link: ".//h2/a/@href",
  date: ".//time/text()",
};

const REQUEST_ID = "0f8e1c2a-request";

describe("handle web feeds", () => {
  describe("when a page is analyzed", () => {
    it("starts the analysis and answers its request id, leaving the cache alone", async () => {
      const upstream = fakeUpstream({
        "POST /webfeed/analyze": { code: 1, message: "Analyzing page", request_id: REQUEST_ID },
      });
      const cache = cached();
      const response = await send({
        method: "POST",
        url: "/api/webfeeds/analyze",
        body: { url: "https://w.example/news" },
        upstream,
        cache,
      });
      expect(response).toEqual({ status: 200, body: { requestId: REQUEST_ID } });
      expect(upstream.calls[0].form).toEqual({ url: "https://w.example/news" });
      expect(cache.clears).toBe(0);
    });

    it("answers the feed URL alone when the page is already a feed", async () => {
      const upstream = fakeUpstream({
        "POST /webfeed/analyze": {
          code: 2,
          message: "This is already an RSS feed. Subscribing directly.",
          feed_address: "https://w.example/rss",
        },
      });
      const response = await send({
        method: "POST",
        url: "/api/webfeeds/analyze",
        body: { url: "https://w.example/rss" },
        upstream,
      });
      expect(response).toEqual({ status: 200, body: { feedUrl: "https://w.example/rss" } });
    });

    it("answers 400 with NewsBlur's message on a refused URL", async () => {
      const upstream = fakeUpstream({
        "POST /webfeed/analyze": { code: -1, message: "Please enter a valid URL" },
      });
      const response = await send({
        method: "POST",
        url: "/api/webfeeds/analyze",
        body: { url: "ftp://w.example" },
        upstream,
      });
      expect(response).toEqual({
        status: 400,
        body: { error: "bad_request", message: "Please enter a valid URL" },
      });
    });

    it("answers 502 when NewsBlur sends no request id", async () => {
      const upstream = fakeUpstream({ "POST /webfeed/analyze": { code: 1 } });
      const response = await send({
        method: "POST",
        url: "/api/webfeeds/analyze",
        body: { url: "https://w.example/news" },
        upstream,
      });
      expect(response.status).toBe(502);
    });
  });

  describe("when an analysis is polled", () => {
    const poll = async (reply: unknown) => {
      const upstream = fakeUpstream({ "GET /webfeed/status": reply });
      const response = await send({ url: `/api/webfeeds/analyze/${REQUEST_ID}`, upstream });
      return { response, upstream };
    };

    it("answers done with the variants and their previews", async () => {
      const { response, upstream } = await poll({
        code: 1,
        type: "complete",
        request_id: REQUEST_ID,
        variants_data: VARIANTS_DATA,
      });
      expect(upstream.calls[0]).toEqual({
        method: "GET",
        path: "/webfeed/status",
        query: { request_id: REQUEST_ID },
      });
      expect(response).toEqual({
        status: 200,
        body: {
          status: "done",
          htmlHash: "abc123",
          pageTitle: "Shop | News",
          variants: [
            {
              label: "Main article list",
              description: "The news cards",
              fields: { ...FIELDS, content: ".//p/text()" },
              previews: [
                { title: "Spring sale", url: "https://w.example/news/1", summary: "Up to 30%" },
              ],
            },
          ],
        },
      });
    });

    it("answers pending with the progress message while the task runs", async () => {
      const { response } = await poll({ code: 1, type: "progress", message: "Fetching page..." });
      expect(response.body).toEqual({
        status: "pending",
        message: "Fetching page...",
        variants: [],
      });
    });

    it("answers pending for an id NewsBlur has no event for, started or expired", async () => {
      const { response } = await poll({ code: -1, status: "unknown" });
      expect(response).toEqual({ status: 200, body: { status: "pending", variants: [] } });
    });

    it("answers failed with the task error", async () => {
      const { response } = await poll({ code: 1, type: "error", error: "Could not fetch page" });
      expect(response.body).toEqual({
        status: "failed",
        message: "Could not fetch page",
        variants: [],
      });
    });

    it("answers failed when a complete task lost its results", async () => {
      const { response } = await poll({ code: 1, type: "complete" });
      expect(response.body).toEqual({ status: "failed", variants: [] });
    });

    it("answers 404 for a malformed id, without calling NewsBlur", async () => {
      const upstream = fakeUpstream({});
      const response = await send({ url: "/api/webfeeds/analyze/short", upstream });
      expect(response.status).toBe(404);
      expect(upstream.calls).toEqual([]);
    });
  });

  describe("when a web feed is subscribed", () => {
    const subscribed = (id = 8) => ({
      code: 1,
      message: "Subscribed to web feed",
      feed: {
        id,
        feed_title: "w.example",
        feed_address: "webfeed:https://w.example/news",
        feed_link: "https://w.example/news",
        is_webfeed: true,
      },
    });
    const body = {
      url: "https://w.example/news",
      variantIndex: 0,
      fields: FIELDS,
      htmlHash: "abc123",
      categoryIds: ["Tech", "News"],
    };

    it("sends the variant fields, adds the other categories and drops the cache", async () => {
      const upstream = fakeUpstream({
        "POST /webfeed/subscribe": subscribed(),
        "POST /reader/rename_feed": { code: 1 },
        "POST /reader/move_feed_to_folders": { code: 1 },
      });
      const cache = cached();
      const response = await send({
        method: "POST",
        url: "/api/webfeeds",
        body: { ...body, title: "Shop" },
        upstream,
        cache,
      });
      expect(response).toEqual({
        status: 201,
        body: {
          id: "8",
          title: "Shop",
          siteUrl: "https://w.example/news",
          feedUrl: "webfeed:https://w.example/news",
          categoryIds: ["Tech", "News"],
          isNewsletter: false,
          isWebFeed: true,
        },
      });
      expect(upstream.calls.map((call) => call.form)).toEqual([
        {
          url: "https://w.example/news",
          variant_index: "0",
          folder: "Tech",
          feed_title: "Shop",
          story_container_xpath: FIELDS.storyContainer,
          title_xpath: FIELDS.title,
          link_xpath: FIELDS.link,
          content_xpath: "",
          image_xpath: "",
          author_xpath: "",
          date_xpath: FIELDS.date,
          html_hash: "abc123",
        },
        { feed_id: "8", feed_title: "Shop" },
        {
          feed_id: "8",
          in_folders: [],
          to_folders: ["News"],
          in_folder_paths: "[]",
          to_folder_paths: JSON.stringify([["News"]]),
        },
      ]);
      expect(cache.clears).toBe(1);
    });

    it("only swaps the variant of a web feed already followed", async () => {
      const upstream = fakeUpstream({ "POST /webfeed/subscribe": subscribed(5) });
      const response = await send({
        method: "POST",
        url: "/api/webfeeds",
        body: { ...body, variantIndex: 1, categoryIds: [] },
        upstream,
        cache: cached(),
      });
      expect(response).toEqual({
        status: 200,
        body: {
          id: "5",
          title: "Shop news",
          siteUrl: "https://w.example/news",
          feedUrl: "webfeed:https://w.example/news",
          categoryIds: [],
          isNewsletter: false,
          isWebFeed: true,
        },
      });
      expect(upstream.calls).toHaveLength(1);
      expect(upstream.calls[0].form).toMatchObject({ variant_index: "1", folder: "" });
    });

    it("answers 403 premium_required when the account lacks Premium Archive", async () => {
      const message = "Web Feed requires a Premium Archive subscription.";
      const upstream = fakeUpstream({ "POST /webfeed/subscribe": { code: -1, message } });
      const response = await send({
        method: "POST",
        url: "/api/webfeeds",
        body,
        upstream,
        cache: cached(),
      });
      expect(response).toEqual({ status: 403, body: { error: "premium_required", message } });
    });

    it("answers 400 with NewsBlur's message on another refusal", async () => {
      const message = "Missing XPath expressions for story extraction";
      const upstream = fakeUpstream({ "POST /webfeed/subscribe": { code: -1, message } });
      const response = await send({
        method: "POST",
        url: "/api/webfeeds",
        body,
        upstream,
        cache: cached(),
      });
      expect(response).toEqual({ status: 400, body: { error: "bad_request", message } });
    });

    it("answers 502 when NewsBlur sends no feed", async () => {
      const upstream = fakeUpstream({ "POST /webfeed/subscribe": { code: 1 } });
      const response = await send({
        method: "POST",
        url: "/api/webfeeds",
        body,
        upstream,
        cache: cached(),
      });
      expect(response.status).toBe(502);
    });

    it("rejects a body with no story container", async () => {
      const response = await send({
        method: "POST",
        url: "/api/webfeeds",
        body: { ...body, fields: { title: FIELDS.title } },
        upstream: fakeUpstream({}),
      });
      expect(response.status).toBe(400);
    });
  });

  describe("when a web feed is reanalyzed", () => {
    it("starts the analysis and answers the page URL to subscribe again with", async () => {
      const upstream = fakeUpstream({
        "POST /webfeed/reanalyze": { code: 1, request_id: REQUEST_ID, feed_id: 5 },
      });
      const cache = cached();
      const response = await send({
        method: "POST",
        url: "/api/feeds/5/reanalyze",
        body: {},
        upstream,
        cache,
      });
      expect(response).toEqual({
        status: 200,
        body: { requestId: REQUEST_ID, url: "https://w.example/news" },
      });
      expect(upstream.calls[0].form).toEqual({ feed_id: "5" });
      expect(cache.clears).toBe(0);
    });

    it("answers 400 for a feed that is not a web feed", async () => {
      const upstream = fakeUpstream({});
      const response = await send({
        method: "POST",
        url: "/api/feeds/1/reanalyze",
        body: {},
        upstream,
        cache: cached(),
      });
      expect(response.status).toBe(400);
      expect(upstream.calls).toEqual([]);
    });

    it("answers 404 for a feed not followed", async () => {
      const response = await send({
        method: "POST",
        url: "/api/feeds/99/reanalyze",
        body: {},
        upstream: fakeUpstream({}),
        cache: cached(),
      });
      expect(response.status).toBe(404);
    });

    it("answers 502 when NewsBlur sends no request id", async () => {
      const upstream = fakeUpstream({ "POST /webfeed/reanalyze": { code: 1 } });
      const response = await send({
        method: "POST",
        url: "/api/feeds/5/reanalyze",
        body: {},
        upstream,
        cache: cached(),
      });
      expect(response.status).toBe(502);
    });
  });
});
