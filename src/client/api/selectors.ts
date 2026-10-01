import type { Collection, Preferences, Subscription } from "shared/feedsApi/types";

export const CATEGORIES_ORDERING_KEY = "categoriesOrderingId";

export const feedsInCategory = ({
  subscriptions,
  categoryId,
}: {
  subscriptions: Subscription[];
  categoryId: string;
}): Subscription[] =>
  subscriptions.filter((subscription) =>
    subscription.categories.some((category) => category.id === categoryId),
  );

export const orphansOf = ({
  subscriptions,
  categoryId,
}: {
  subscriptions: Subscription[];
  categoryId: string;
}): Subscription[] =>
  subscriptions.filter(
    (subscription) =>
      subscription.categories.length === 1 && subscription.categories[0]?.id === categoryId,
  );

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

// Categories missing from the stored order go last in API order; stale ids are skipped.
export const orderCollections = ({
  collections,
  preferences,
}: {
  collections: Collection[];
  preferences: Preferences | undefined;
}): Collection[] => {
  const ordering = parseOrdering(preferences?.[CATEGORIES_ORDERING_KEY]);
  if (ordering === undefined) return collections;
  const rank = new Map(ordering.map((id, index) => [id, index]));
  const ranked = collections
    .filter((collection) => rank.has(collection.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...ranked, ...collections.filter((collection) => !rank.has(collection.id))];
};
