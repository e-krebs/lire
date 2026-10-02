import { describe, expect, it } from "vitest";
import {
  categoryStreamId,
  feedStreamId,
  globalAllStreamId,
  globalReadStreamId,
  globalUncategorizedStreamId,
} from "shared/feedsApi/streams";
import type { Collection, Subscription } from "shared/feedsApi/types";
import { catalogs } from "client/i18n/messages";
import { streamLabel } from "../streamLabel";

const USER_ID = "user-1";
const techId = categoryStreamId({ userId: USER_ID, label: "Tech" });
const techFeedId = feedStreamId("https://tech.example/rss");
const staleFeedId = feedStreamId("https://stale.example/rss");
const looseFeedId = feedStreamId("https://loose.example/rss");

const collections: Collection[] = [{ id: techId, label: "Tech", feeds: [] }];
const subscriptions: Subscription[] = [
  { id: techFeedId, title: "Tech Feed", categories: [{ id: techId, label: "Old Tech" }] },
  {
    id: staleFeedId,
    title: "Stale Feed",
    categories: [{ id: "user/user-1/category/gone", label: "Gone" }],
  },
  { id: looseFeedId, title: "Loose Feed", categories: [] },
];

const labelsEn = { ...catalogs.en.navigation, uncategorized: catalogs.en.shell.uncategorized };
const labelsFr = catalogs.fr.navigation;
const label = (streamId: string) =>
  streamLabel({
    streamId,
    collections,
    subscriptions,
    labels: labelsEn,
  });

describe("streamLabel", () => {
  it("names the global streams", () => {
    expect(label(globalAllStreamId(USER_ID))).toEqual({ kind: "all", label: "All articles" });
    expect(label(globalReadStreamId(USER_ID))).toEqual({ kind: "all", label: "Recently read" });
    expect(label(globalUncategorizedStreamId(USER_ID))).toEqual({
      kind: "category",
      label: "Uncategorized",
    });
  });

  it("names a category from the loaded collections", () => {
    expect(label(techId)).toEqual({ kind: "category", label: "Tech" });
  });

  it("names a feed under its collection's label", () => {
    expect(label(techFeedId)).toEqual({ kind: "feed", label: "Tech Feed", parent: "Tech" });
  });

  it("falls back to the subscription's category label, then to Uncategorized", () => {
    expect(label(staleFeedId)).toEqual({ kind: "feed", label: "Stale Feed", parent: "Gone" });
    expect(label(looseFeedId)).toEqual({
      kind: "feed",
      label: "Loose Feed",
      parent: "Uncategorized",
    });
  });

  it("returns the raw id when nothing matches or nothing has loaded", () => {
    const unknownId = feedStreamId("https://unknown.example/rss");
    expect(label(unknownId)).toEqual({ kind: "unknown", label: unknownId });
    expect(
      streamLabel({
        streamId: techId,
        collections: undefined,
        subscriptions: undefined,
        labels: labelsEn,
      }),
    ).toEqual({ kind: "unknown", label: techId });
  });

  it("takes its constant labels from the given catalog", () => {
    const named = streamLabel({
      streamId: globalAllStreamId(USER_ID),
      collections,
      subscriptions,
      labels: { ...labelsFr, uncategorized: catalogs.fr.shell.uncategorized },
    });
    expect(named.label).toBe("Tous les articles");
  });
});
