import { describe, expect, it } from "vitest";
import { toLibrary } from "../library";
import { FeedsAnswerSchema } from "../upstream";
import { FEEDS_ANSWER } from "test/bffHarness";

describe("toLibrary", () => {
  const library = toLibrary(FeedsAnswerSchema.parse(FEEDS_ANSWER));

  it("lists the feeds present in the tree, with their top-level folders", () => {
    expect(library.feeds).toEqual([
      {
        id: "4",
        title: "Root",
        feedUrl: "https://d.example/feed",
        categoryIds: [],
        isNewsletter: false,
      },
      {
        id: "1",
        title: "Alpha",
        siteUrl: "https://a.example",
        feedUrl: "https://a.example/feed",
        iconUrl: "https://newsblur.com/rss_feeds/icon/1",
        categoryIds: ["Tech"],
        isNewsletter: false,
      },
      {
        id: "2",
        title: "Beta",
        feedUrl: "https://b.example/feed",
        iconUrl: "https://s3.amazonaws.com/icons/2.png",
        categoryIds: ["Tech", "News"],
        isNewsletter: false,
      },
      {
        id: "3",
        title: "Letters",
        feedUrl: "newsletter:abc",
        categoryIds: ["News", "Tech"],
        isNewsletter: true,
      },
    ]);
  });

  it("makes one category per top-level folder title", () => {
    expect(library.categories).toEqual([
      { id: "Tech", label: "Tech", feedIds: ["1", "2", "3"] },
      { id: "News", label: "News", feedIds: ["2", "3"] },
      { id: "Empty", label: "Empty", feedIds: [] },
    ]);
  });

  it("keeps every real folder path", () => {
    expect(library.subscriptions.get("2")?.placements).toEqual([["Tech", "Deep"], ["News"]]);
    expect(library.subscriptions.get("4")?.placements).toEqual([[]]);
  });
});
