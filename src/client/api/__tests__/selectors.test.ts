import { describe, expect, it } from "vitest";
import type { Collection, Subscription } from "shared/feedsApi/types";
import {
  CATEGORIES_ORDERING_KEY,
  feedsInCategory,
  orderCollections,
  orphansOf,
} from "../selectors";

const feed = ({ id, categoryIds }: { id: string; categoryIds: string[] }): Subscription => ({
  id,
  title: id,
  categories: categoryIds.map((categoryId) => ({ id: categoryId, label: categoryId })),
});

const subscriptions = [
  feed({ id: "feed/c", categoryIds: ["a"] }),
  feed({ id: "feed/a", categoryIds: ["a", "b"] }),
  feed({ id: "feed/b", categoryIds: ["b"] }),
];

const collections: Collection[] = ["a", "b", "c"].map((id) => ({ id, label: id, feeds: [] }));
const order = (value: unknown): string[] =>
  orderCollections({ collections, preferences: { [CATEGORIES_ORDERING_KEY]: value } }).map(
    ({ id }) => id,
  );

describe("selectors", () => {
  it("returns every feed carrying the category, in the given order", () => {
    expect(feedsInCategory({ subscriptions, categoryId: "a" }).map(({ id }) => id)).toEqual([
      "feed/c",
      "feed/a",
    ]);
  });

  it("returns only the feeds whose sole category it is", () => {
    expect(orphansOf({ subscriptions, categoryId: "a" }).map(({ id }) => id)).toEqual(["feed/c"]);
    expect(orphansOf({ subscriptions, categoryId: "b" }).map(({ id }) => id)).toEqual(["feed/b"]);
    expect(orphansOf({ subscriptions, categoryId: "z" })).toEqual([]);
  });

  it("follows a full stored order", () => {
    expect(order(JSON.stringify(["c", "a", "b"]))).toEqual(["c", "a", "b"]);
  });

  it("appends categories missing from the order in API order", () => {
    expect(order(JSON.stringify(["c"]))).toEqual(["c", "a", "b"]);
  });

  it("skips stale ids", () => {
    expect(order(JSON.stringify(["gone", "b", "a"]))).toEqual(["b", "a", "c"]);
  });

  it("keeps API order on a missing or malformed value", () => {
    expect(orderCollections({ collections, preferences: undefined })).toBe(collections);
    expect(orderCollections({ collections, preferences: {} })).toBe(collections);
    expect(order(["c", "a"])).toEqual(["a", "b", "c"]);
    expect(order("not json")).toEqual(["a", "b", "c"]);
    expect(order(JSON.stringify({ c: 0 }))).toEqual(["a", "b", "c"]);
    expect(order(JSON.stringify([1, 2]))).toEqual(["a", "b", "c"]);
  });
});
