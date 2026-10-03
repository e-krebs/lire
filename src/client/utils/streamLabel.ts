import type { Stream } from "shared/feedsApi/streamKey";
import type { Category, Feed } from "shared/feedsApi/types";

export interface StreamLabel {
  kind: "all" | "category" | "feed" | "unknown";
  label: string;
  // The feed's category, for the "Category › Feed" form.
  parent?: string;
}

// Names a stream from the loaded categories and feeds.
export const streamLabel = ({
  stream,
  categories,
  feeds,
  labels,
}: {
  stream: Stream;
  categories: readonly Category[] | undefined;
  feeds: readonly Feed[] | undefined;
  labels: { allArticles: string; recentlyRead: string; uncategorized: string };
}): StreamLabel => {
  if (stream.kind === "all") return { kind: "all", label: labels.allArticles };
  if (stream.kind === "read") return { kind: "all", label: labels.recentlyRead };

  if (stream.kind === "folder") {
    const category = categories?.find((entry) => entry.id === stream.label);
    return category
      ? { kind: "category", label: category.label }
      : { kind: "unknown", label: stream.label };
  }

  const feed = feeds?.find((entry) => entry.id === stream.feedId);
  if (!feed) return { kind: "unknown", label: stream.feedId };
  const categoryId = feed.categoryIds.at(0);
  const parent =
    categories?.find((entry) => entry.id === categoryId)?.label ??
    categoryId ??
    labels.uncategorized;
  return { kind: "feed", label: feed.title, parent };
};
