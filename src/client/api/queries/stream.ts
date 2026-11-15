import { useInfiniteQuery } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { searchEntries, getStreamEntries, type EntryOrder } from "client/api/client";
import { sendQueuedReads } from "client/api/markQueue";
import { useTier } from "client/hooks/useTier";
import { parseStreamKey, type StreamKey } from "shared/feedsApi/streamKey";
import type { EntryPage, Entry } from "shared/feedsApi/types";
import { buildEntryListKey, unreadCountFor } from "./shared";
import { useCounts } from "./session";

// NewsBlur pages by number, so a story that arrives between two fetches shifts the next page and
// repeats the last story of the previous one. The grid keys its layout by id: a repeat would
// reserve a slot and leave it empty.
export const flattenStream = (data: InfiniteData<EntryPage> | undefined): Entry[] => {
  const seen = new Set<string>();
  return (data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((entry) => !seen.has(entry.id) && seen.add(entry.id));
};

const DESKTOP_RIVER_COUNT = 24;
const DESKTOP_FEED_COUNT = 12;

// Phone and tablet keep the server's default page size.
export const pageCountFor = ({
  tier,
  streamKey,
}: {
  tier: ReturnType<typeof useTier>;
  streamKey: StreamKey;
}): number | undefined => {
  if (tier !== "desktop") return undefined;
  return parseStreamKey(streamKey)?.kind === "feed" ? DESKTOP_FEED_COUNT : DESKTOP_RIVER_COUNT;
};

export const useStream = ({
  streamKey,
  unreadOnly,
  order,
  count,
  enabled = true,
}: {
  streamKey: StreamKey;
  unreadOnly?: boolean;
  order?: EntryOrder;
  count?: number;
  enabled?: boolean;
}) =>
  useInfiniteQuery({
    queryKey: buildEntryListKey({ streamKey, unreadOnly, order, count }),
    queryFn: async ({ pageParam }) => {
      await sendQueuedReads();
      return getStreamEntries({ streamKey, unreadOnly, order, count, cursor: pageParam });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled,
  });

export const MIN_SEARCH_LENGTH = 2;

// `query` must already be debounced by the caller, like `useFeedLookup`.
export const useSearchContents = ({
  streamKey,
  query,
  unreadOnly,
  count,
  enabled = true,
}: {
  streamKey: StreamKey;
  query: string;
  unreadOnly?: boolean;
  count?: number;
  enabled?: boolean;
}) =>
  useInfiniteQuery({
    queryKey: buildEntryListKey({ streamKey, query, unreadOnly, count }),
    queryFn: async ({ pageParam }) => {
      await sendQueuedReads();
      return searchEntries({ streamKey, query, unreadOnly, count, cursor: pageParam });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: enabled && query.trim().length >= MIN_SEARCH_LENGTH,
  });

const MATCH_COUNT_CAP = 50;
// A feed page has no `limit`: the Worker chains upstream pages of 6, so 12 costs two calls.
const FEED_MATCH_COUNT_CAP = 12;

// `capped`: the view holds `count` or more.
export interface MatchCount {
  count: number;
  capped: boolean;
}

const matchCountOf = ({ count, cap }: { count: number; cap: number }): MatchCount | undefined =>
  count <= 0 ? undefined : { count: Math.min(count, cap), capped: count >= cap };

export const useMatchCount = ({
  streamKey,
  unreadOnly,
  query,
}: {
  streamKey: StreamKey | undefined;
  unreadOnly: boolean;
  query: string;
}): MatchCount | undefined => {
  const kind = streamKey === undefined ? undefined : parseStreamKey(streamKey)?.kind;
  const active = streamKey !== undefined && kind !== undefined && kind !== "read";
  const cap = kind === "feed" ? FEED_MATCH_COUNT_CAP : MATCH_COUNT_CAP;
  const trimmed = query.trim();
  const searching = trimmed !== "";
  const searchable = trimmed.length >= MIN_SEARCH_LENGTH;
  const fromCounts = active && unreadOnly && !searching;
  // Never read while disabled, so the placeholder key is only there to satisfy the types.
  const key = streamKey ?? "all";

  const counts = useCounts({ enabled: fromCounts });
  const stream = useStream({
    streamKey: key,
    unreadOnly,
    order: "newest",
    count: cap,
    enabled: active && !unreadOnly && !searching,
  });
  const search = useSearchContents({
    streamKey: key,
    query,
    unreadOnly,
    count: cap,
    enabled: active && searchable,
  });

  if (!active || (searching && !searchable)) return undefined;
  if (fromCounts) {
    if (!counts.data) return undefined;
    // The counts are exact and cost nothing, so they keep the wide cap even on a feed.
    return matchCountOf({
      count: unreadCountFor({ counts: counts.data, streamKey }),
      cap: MATCH_COUNT_CAP,
    });
  }
  const items = (searching ? search : stream).data?.pages[0]?.items;
  if (!items) return undefined;
  // A full page means more lie past it, however many of these were read since.
  if (items.length >= cap) return matchCountOf({ count: cap, cap });
  // A read flips the row in the cache without removing it.
  const count = unreadOnly ? items.filter((item) => item.unread).length : items.length;
  return matchCountOf({ count, cap });
};
