import { describe, expect, it } from "vitest";
import { encodeParams, FeedsAnswerSchema } from "../upstream";

describe("upstream", () => {
  it("encodes arrays as repeated keys", () => {
    expect(encodeParams({ feeds: ["1", "2"], page: "1", none: [] }).toString()).toBe(
      "feeds=1&feeds=2&page=1",
    );
  });

  it("reads the empty-account feed list, sent as an array", () => {
    const parsed = FeedsAnswerSchema.parse({
      feeds: [{ id: 5, feed_title: "Five", feed_address: "https://f.example/feed" }],
      folders: [],
    });
    expect(parsed.feeds).toEqual({
      "5": { id: 5, feed_title: "Five", feed_address: "https://f.example/feed" },
    });
  });
});
