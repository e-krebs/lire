import {
  isGlobalAllStreamId,
  isGlobalUncategorizedStreamId,
  isReadStreamId,
} from "shared/feedsApi/streams";
import type { Collection, Subscription } from "shared/feedsApi/types";

const UNCATEGORIZED_LABEL = "Uncategorized";

export interface StreamLabel {
  kind: "all" | "category" | "feed" | "unknown";
  label: string;
  // The feed's category, for the "Category › Feed" form.
  parent?: string;
}

// Names a full stream id from the loaded collections and subscriptions.
export const streamLabel = ({
  streamId,
  collections,
  subscriptions,
}: {
  streamId: string;
  collections: readonly Collection[] | undefined;
  subscriptions: readonly Subscription[] | undefined;
}): StreamLabel => {
  if (isGlobalAllStreamId(streamId)) return { kind: "all", label: "All articles" };
  if (isReadStreamId(streamId)) return { kind: "all", label: "Recently read" };
  if (isGlobalUncategorizedStreamId(streamId)) {
    return { kind: "category", label: UNCATEGORIZED_LABEL };
  }

  const collection = collections?.find((entry) => entry.id === streamId);
  if (collection) return { kind: "category", label: collection.label };

  const subscription = subscriptions?.find((entry) => entry.id === streamId);
  if (subscription) {
    const categoryId = subscription.categories[0]?.id;
    const parent =
      collections?.find((entry) => entry.id === categoryId)?.label ??
      subscription.categories[0]?.label ??
      UNCATEGORIZED_LABEL;
    return { kind: "feed", label: subscription.title, parent };
  }

  return { kind: "unknown", label: streamId };
};
