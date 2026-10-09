import type { EntryOrder } from "client/api/client";
import type { StreamKey } from "shared/feedsApi/streamKey";

export const keys = {
  authStatus: ["authStatus"] as const,
  profile: ["profile"] as const,
  categories: ["categories"] as const,
  feeds: ["feeds"] as const,
  counts: ["counts"] as const,
  preferences: ["preferences"] as const,
  newsletterAddress: ["newsletterAddress"] as const,
  sun: (tz: string) => ["sun", tz] as const,
  stream: ({
    streamKey,
    unreadOnly,
    order,
    count,
  }: {
    streamKey: StreamKey;
    unreadOnly?: boolean;
    order?: EntryOrder;
    count?: number;
  }) =>
    [
      "stream",
      streamKey,
      { unreadOnly: unreadOnly ?? false, order: order ?? "newest", count },
    ] as const,
  search: ({
    streamKey,
    query,
    unreadOnly,
    count,
  }: {
    streamKey: StreamKey;
    query: string;
    unreadOnly?: boolean;
    count?: number;
  }) => ["search", streamKey, query, { unreadOnly: unreadOnly ?? false, count }] as const,
  entry: (entryId: string) => ["entry", entryId] as const,
  feedLookup: (query: string) => ["feedLookup", query] as const,
  webFeedStatus: (requestId: string) => ["webFeedStatus", requestId] as const,
};
