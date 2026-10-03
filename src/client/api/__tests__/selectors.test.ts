import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER_KEY } from "shared/feedsApi/preferences";
import type { Category, Feed } from "shared/feedsApi/types";
import { feedsInCategory, orderCategories, orphansOf } from "../selectors";

const feed = ({ id, categoryIds }: { id: string; categoryIds: string[] }): Feed => ({
  id,
  title: id,
  categoryIds,
  isNewsletter: false,
});

const feeds = [
  feed({ id: "3", categoryIds: ["a"] }),
  feed({ id: "1", categoryIds: ["a", "b"] }),
  feed({ id: "2", categoryIds: ["b"] }),
];

const categories: Category[] = ["a", "b", "c"].map((id) => ({ id, label: id, feedIds: [] }));
const order = (value: string): string[] =>
  orderCategories({ categories, preferences: { [CATEGORY_ORDER_KEY]: value } }).map(({ id }) => id);

describe("selectors", () => {
  it("returns every feed carrying the category, in the given order", () => {
    expect(feedsInCategory({ feeds, categoryId: "a" }).map(({ id }) => id)).toEqual(["3", "1"]);
  });

  it("returns only the feeds whose sole category it is", () => {
    expect(orphansOf({ feeds, categoryId: "a" }).map(({ id }) => id)).toEqual(["3"]);
    expect(orphansOf({ feeds, categoryId: "b" }).map(({ id }) => id)).toEqual(["2"]);
    expect(orphansOf({ feeds, categoryId: "z" })).toEqual([]);
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
    expect(orderCategories({ categories, preferences: undefined })).toBe(categories);
    expect(orderCategories({ categories, preferences: {} })).toBe(categories);
    expect(order("not json")).toEqual(["a", "b", "c"]);
    expect(order(JSON.stringify({ c: 0 }))).toEqual(["a", "b", "c"]);
    expect(order(JSON.stringify([1, 2]))).toEqual(["a", "b", "c"]);
  });
});
