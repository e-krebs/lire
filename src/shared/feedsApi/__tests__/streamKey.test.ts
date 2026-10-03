import { describe, expect, it } from "vitest";
import { parseStreamKey, toStreamKey, type Stream } from "shared/feedsApi/streamKey";

describe("streamKey", () => {
  it("writes each stream kind", () => {
    expect(toStreamKey({ kind: "all" })).toBe("all");
    expect(toStreamKey({ kind: "read" })).toBe("read");
    expect(toStreamKey({ kind: "folder", label: "Tech News" })).toBe("folder:Tech News");
    expect(toStreamKey({ kind: "feed", feedId: "42" })).toBe("feed:42");
  });

  it.for<Stream>([
    { kind: "all" },
    { kind: "read" },
    { kind: "folder", label: "Tech News" },
    { kind: "folder", label: "100% Design & Code" },
    { kind: "folder", label: "all" },
    { kind: "folder", label: "a/b: c" },
    { kind: "feed", feedId: "6106374" },
  ])("survives %o", (stream) => {
    expect(parseStreamKey(toStreamKey(stream))).toEqual(stream);
  });

  it.for(["", "Tech News", "folder:", "feed:", "feed:abc", "feed:12a", "feed:http://x.test/rss"])(
    "rejects %j",
    (key) => {
      expect(parseStreamKey(key)).toBeNull();
    },
  );
});
