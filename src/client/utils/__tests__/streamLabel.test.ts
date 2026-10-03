import { describe, expect, it } from "vitest";
import type { Stream } from "shared/feedsApi/streamKey";
import type { Category, Feed } from "shared/feedsApi/types";
import { catalogs } from "client/i18n/messages";
import { streamLabel } from "../streamLabel";

const categories: Category[] = [{ id: "Tech", label: "Tech", feedIds: ["10"] }];
const feeds: Feed[] = [
  { id: "10", title: "Tech Feed", categoryIds: ["Tech"], isNewsletter: false },
  { id: "11", title: "Stale Feed", categoryIds: ["Gone"], isNewsletter: false },
  { id: "12", title: "Loose Feed", categoryIds: [], isNewsletter: false },
];

const labelsEn = { ...catalogs.en.navigation, uncategorized: catalogs.en.shell.uncategorized };
const labelsFr = catalogs.fr.navigation;
const label = (stream: Stream) => streamLabel({ stream, categories, feeds, labels: labelsEn });

describe("streamLabel", () => {
  it("names the built-in streams", () => {
    expect(label({ kind: "all" })).toEqual({ kind: "all", label: "All articles" });
    expect(label({ kind: "read" })).toEqual({ kind: "all", label: "Recently read" });
  });

  it("names a folder from the loaded categories", () => {
    expect(label({ kind: "folder", label: "Tech" })).toEqual({ kind: "category", label: "Tech" });
  });

  it("names a feed under its category's label", () => {
    expect(label({ kind: "feed", feedId: "10" })).toEqual({
      kind: "feed",
      label: "Tech Feed",
      parent: "Tech",
    });
  });

  it("falls back to the category id, then to Uncategorized", () => {
    expect(label({ kind: "feed", feedId: "11" })).toEqual({
      kind: "feed",
      label: "Stale Feed",
      parent: "Gone",
    });
    expect(label({ kind: "feed", feedId: "12" })).toEqual({
      kind: "feed",
      label: "Loose Feed",
      parent: "Uncategorized",
    });
  });

  it("returns the raw key part when nothing matches or nothing has loaded", () => {
    expect(label({ kind: "feed", feedId: "99" })).toEqual({ kind: "unknown", label: "99" });
    expect(
      streamLabel({
        stream: { kind: "folder", label: "Tech" },
        categories: undefined,
        feeds: undefined,
        labels: labelsEn,
      }),
    ).toEqual({ kind: "unknown", label: "Tech" });
  });

  it("takes its constant labels from the given catalog", () => {
    const named = streamLabel({
      stream: { kind: "all" },
      categories,
      feeds,
      labels: { ...labelsFr, uncategorized: catalogs.fr.shell.uncategorized },
    });
    expect(named.label).toBe("Tous les articles");
  });
});
