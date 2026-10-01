import { describe, expect, it } from "vitest";
import {
  categoryStreamId,
  feedStreamId,
  globalAllStreamId,
  globalReadStreamId,
} from "shared/feedsApi/streams";
import { fromStreamKey, toStreamKey } from "shared/feedsApi/streamKey";

const userId = "5f3d4b2a-1234-4c56-8def-9876543210ab";

describe("streamKey", () => {
  it("shortens the built-in streams", () => {
    expect(toStreamKey(globalAllStreamId(userId))).toBe("all");
    expect(toStreamKey(globalReadStreamId(userId))).toBe("read");
  });

  it("keeps a category's last id segment, whatever shape it has", () => {
    expect(toStreamKey(categoryStreamId({ userId, label: "Tech News" }))).toBe("Tech News");
    expect(toStreamKey(categoryStreamId({ userId, label: "0efbd7ec-1111" }))).toBe("0efbd7ec-1111");
    expect(toStreamKey(categoryStreamId({ userId, label: "high-tech" }))).toBe("high-tech");
  });

  it("prefixes a feed url", () => {
    expect(toStreamKey(feedStreamId("http://example-news.test/rss.xml"))).toBe(
      "feed:http://example-news.test/rss.xml",
    );
  });

  it("rebuilds the built-in streams from the user id", () => {
    expect(fromStreamKey({ key: "all", userId })).toBe(globalAllStreamId(userId));
    expect(fromStreamKey({ key: "read", userId })).toBe(globalReadStreamId(userId));
  });

  it("reads a bare key as a category segment", () => {
    expect(fromStreamKey({ key: "Tech News", userId })).toBe(`user/${userId}/category/Tech News`);
  });

  it("reads a feed key as a feed url", () => {
    expect(fromStreamKey({ key: "feed:http://example-news.test/rss.xml", userId })).toBe(
      "feed/http://example-news.test/rss.xml",
    );
  });

  it.for([
    globalAllStreamId(userId),
    globalReadStreamId(userId),
    categoryStreamId({ userId, label: "Tech News" }),
    feedStreamId("http://example-news.test/rss.xml"),
    categoryStreamId({ userId, label: "Design (and type)" }),
    categoryStreamId({ userId, label: "100% Design & Code" }),
  ])("survives %s", (streamId) => {
    expect(fromStreamKey({ key: toStreamKey(streamId), userId })).toBe(streamId);
  });
});
