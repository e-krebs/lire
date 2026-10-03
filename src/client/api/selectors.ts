import { CATEGORY_ORDER_KEY } from "shared/feedsApi/preferences";
import type { Category, Feed, Preferences } from "shared/feedsApi/types";

export const feedsInCategory = ({
  feeds,
  categoryId,
}: {
  feeds: Feed[];
  categoryId: string;
}): Feed[] => feeds.filter((feed) => feed.categoryIds.includes(categoryId));

export const orphansOf = ({ feeds, categoryId }: { feeds: Feed[]; categoryId: string }): Feed[] =>
  feeds.filter((feed) => feed.categoryIds.length === 1 && feed.categoryIds[0] === categoryId);

const parseOrdering = (value: unknown): string[] | undefined => {
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string")
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
};

// The Worker already orders categories; this reapplies the cached preference so a reorder shows
// before the refetch. Categories missing from the stored order go last in API order; stale ids are
// skipped.
export const orderCategories = ({
  categories,
  preferences,
}: {
  categories: Category[];
  preferences: Preferences | undefined;
}): Category[] => {
  const ordering = parseOrdering(preferences?.[CATEGORY_ORDER_KEY]);
  if (ordering === undefined) return categories;
  const rank = new Map(ordering.map((id, index) => [id, index]));
  const ranked = categories
    .filter((category) => rank.has(category.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...ranked, ...categories.filter((category) => !rank.has(category.id))];
};
