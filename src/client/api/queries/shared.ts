import type { QueryClient } from "@tanstack/react-query";
import { ApiError, type EntryOrder } from "client/api/client";
import { keys } from "client/api/keys";
import type { Counts } from "shared/feedsApi/types";
import { parseStreamKey, type StreamKey } from "shared/feedsApi/streamKey";

// Every entry-list key goes through here (the stream hooks and `entryListKey`), so they cannot drift.
export const buildEntryListKey = ({
  streamKey,
  unreadOnly,
  order,
  query,
  count,
}: {
  streamKey: StreamKey;
  unreadOnly?: boolean;
  order?: EntryOrder;
  query?: string;
  count?: number;
}) =>
  query !== undefined
    ? keys.search({ streamKey, query, unreadOnly, count })
    : keys.stream({ streamKey, unreadOnly, order, count });

// The key of the list a stream view shows: its search results while searching, else the stream.
export const entryListKey = ({
  streamKey,
  unreadOnly,
  order,
  query,
  count,
}: {
  streamKey: StreamKey;
  unreadOnly: boolean;
  order: EntryOrder;
  query?: string;
  count: number | undefined;
}): readonly unknown[] =>
  buildEntryListKey({
    streamKey,
    unreadOnly,
    order,
    query: query !== undefined && query.trim() !== "" ? query : undefined,
    count,
  });

export const isSignInRequired = (error: unknown): boolean =>
  error instanceof ApiError && error.code === "sign_in_required";

export const isPremiumRequired = (error: unknown): boolean =>
  error instanceof ApiError && error.code === "premium_required";

// The read stream has no unread count.
export const unreadCountFor = ({
  counts,
  streamKey,
}: {
  counts: Counts | undefined;
  streamKey: StreamKey | undefined;
}): number => {
  const stream = streamKey === undefined ? null : parseStreamKey(streamKey);
  if (!counts || !stream) return 0;
  if (stream.kind === "all") return counts.all;
  if (stream.kind === "folder") return counts.categories[stream.label] ?? 0;
  if (stream.kind === "feed") return counts.feeds[stream.feedId] ?? 0;
  return 0;
};

export const invalidateLibrary = (client: QueryClient): void => {
  void client.invalidateQueries({ queryKey: keys.categories });
  void client.invalidateQueries({ queryKey: keys.feeds });
  void client.invalidateQueries({ queryKey: keys.counts });
};
