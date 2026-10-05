import {
  queryOptions,
  useInfiniteQuery,
  useIsMutating,
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createCategory,
  createFeed,
  deleteCategory,
  deleteFeed,
  getAuthStatus,
  getCategories,
  getCounts,
  getEntry,
  getFeeds,
  getNewsletterAddress,
  getPreferences,
  getProfile,
  getStreamEntries,
  getSunPhase,
  markUnread,
  renameCategory,
  searchEntries,
  searchFeeds,
  updateFeed,
  updatePreferences,
  type EntryOrder,
} from "client/api/client";
import { useTier } from "client/hooks/useTier";
import { markReadQueue, sendQueuedReads } from "client/api/markReadQueue";
import { orderCategories, orphansOf } from "client/api/selectors";
import { CATEGORY_ORDER_KEY } from "shared/feedsApi/preferences";
import { parseStreamKey, type StreamKey } from "shared/feedsApi/streamKey";
import type {
  Category,
  Counts,
  Entry,
  EntryPage,
  Feed,
  Preferences,
  PreferencesUpdate,
} from "shared/feedsApi/types";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

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
};

export const isSignInRequired = (error: unknown): boolean =>
  error instanceof ApiError && error.code === "sign_in_required";

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

export const useAuthStatus = () => useQuery({ queryKey: keys.authStatus, queryFn: getAuthStatus });

export const useProfile = () => useQuery({ queryKey: keys.profile, queryFn: getProfile });

export const useCategories = () => useQuery({ queryKey: keys.categories, queryFn: getCategories });

export const useFeeds = () => useQuery({ queryKey: keys.feeds, queryFn: getFeeds });

export const useCounts = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: keys.counts,
    queryFn: async () => {
      await sendQueuedReads();
      return getCounts();
    },
    refetchOnMount: false,
    enabled,
  });

const SUN_MARGIN_MS = 30 * 1000;

const msUntilChange = (nextChangeAt: string | undefined): number =>
  nextChangeAt === undefined
    ? FIVE_MINUTES_MS
    : Math.max(Date.parse(nextChangeAt) - Date.now() + SUN_MARGIN_MS, SUN_MARGIN_MS);

export const sunQueryOptions = ({ tz }: { tz: string }) =>
  queryOptions({
    queryKey: keys.sun(tz),
    queryFn: async () => getSunPhase({ tz }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: true,
    staleTime: (query) => {
      const next = query.state.data?.nextChangeAt;
      return next === undefined
        ? FIVE_MINUTES_MS
        : Math.max(Date.parse(next) - query.state.dataUpdatedAt + SUN_MARGIN_MS, SUN_MARGIN_MS);
    },
    refetchInterval: (query) => msUntilChange(query.state.data?.nextChangeAt),
  });

export const DIRECT_OPEN_STORAGE_KEY = "lire.directOpen";

// One GET per session: the preferences only change through this app's own toggles, which write
// straight into the cache.
export const usePreferences = () =>
  useQuery({
    queryKey: keys.preferences,
    queryFn: getPreferences,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

// Holds the rows until the stored order is known, so they never show in API order first. A failed
// load counts as settled: preferences fall back to API order, categories to no rows.
export const useOrderedCategories = () => {
  const categories = useCategories();
  const preferences = usePreferences();
  return {
    categories: orderCategories({
      categories: categories.data ?? [],
      preferences: preferences.data,
    }),
    ready: !categories.isPending && !preferences.isPending,
  };
};

// A failed write that overlapped a later one leaves its optimistic value behind; the last write
// of the run then refetches the store.
const staleAfterOverlap = new WeakMap<QueryClient, boolean>();

// The scope sends writes one at a time, but every onMutate runs at once, so a snapshot can hold an
// earlier write's optimistic value: only the last write in the queue settles the cache.
export const useUpdatePreferences = () => {
  const client = useQueryClient();
  const othersPending = () => client.isMutating({ mutationKey: keys.preferences }) - 1;
  const refetchIfStale = () => {
    if (!staleAfterOverlap.get(client)) return;
    staleAfterOverlap.delete(client);
    void client.invalidateQueries({ queryKey: keys.preferences });
  };
  return useMutation({
    mutationKey: keys.preferences,
    scope: { id: "preferences" },
    mutationFn: updatePreferences,
    onMutate: async (patch: PreferencesUpdate) => {
      const overlapped = othersPending() > 0;
      await client.cancelQueries({ queryKey: keys.preferences });
      const previous = client.getQueryData<Preferences>(keys.preferences);
      client.setQueryData<Preferences>(keys.preferences, (prev) => {
        const next: Preferences = { ...prev };
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) delete next[key];
          else next[key] = value;
        }
        return next;
      });
      return { previous, overlapped };
    },
    onError: (_error, _patch, context) => {
      if (!context) return;
      if (othersPending() > 0) {
        staleAfterOverlap.set(client, true);
        return;
      }
      client.setQueryData(keys.preferences, context.previous);
      if (context.overlapped) staleAfterOverlap.set(client, true);
      refetchIfStale();
    },
    onSuccess: () => {
      if (othersPending() === 0) refetchIfStale();
    },
  });
};

export const useSavingPreferences = (): boolean =>
  useIsMutating({ mutationKey: keys.preferences }) > 0;

export const useReorderCategories = () => {
  const update = useUpdatePreferences();
  const toPatch = ({ categoryIds }: { categoryIds: string[] }) => ({
    [CATEGORY_ORDER_KEY]: JSON.stringify(categoryIds),
  });
  return {
    ...update,
    mutate: (variables: { categoryIds: string[] }) => {
      update.mutate(toPatch(variables));
    },
    mutateAsync: async (variables: { categoryIds: string[] }) =>
      update.mutateAsync(toPatch(variables)),
  };
};

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
    queryKey: keys.stream({ streamKey, unreadOnly, order, count }),
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
    queryKey: keys.search({ streamKey, query, unreadOnly, count }),
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

// Counts and the library first and awaited: the counts query is often inactive, and parallel
// NewsBlur calls would let the count move without the list.
const refreshCountsThenLists = async ({
  client,
  refreshLists,
}: {
  client: QueryClient;
  refreshLists: () => Promise<unknown>;
}): Promise<void> => {
  await Promise.all(
    [keys.counts, keys.categories, keys.feeds].map(async (queryKey) =>
      client.refetchQueries({ queryKey, type: "all" }),
    ),
  );
  await refreshLists();
};

// Refresh = the first page again, not every page: the trimmed cache keeps showing the old rows
// until the new first page lands, then the sentinel reloads the rest on scroll.
const refreshEntries = async ({
  client,
  queryKey,
  trim,
}: {
  client: QueryClient;
  queryKey: readonly unknown[];
  trim: boolean;
}): Promise<void> => {
  if (trim) {
    // Keeps the old timestamp: only the refetch landing may advance it.
    client.setQueryData<InfiniteData<EntryPage>>(
      queryKey,
      (data) => data && { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
      { updatedAt: client.getQueryState(queryKey)?.dataUpdatedAt },
    );
  }
  // A mark still waiting in the queue would come back unread from the refetch.
  await markReadQueue.flush();
  await refreshCountsThenLists({
    client,
    refreshLists: async () => client.refetchQueries({ queryKey, exact: true }),
  });
};

export const useRefreshEntries = () => {
  const client = useQueryClient();
  return async ({ queryKey, trim = true }: { queryKey: readonly unknown[]; trim?: boolean }) =>
    refreshEntries({ client, queryKey, trim });
};

// No page trim here, unlike a refresh: the reader keeps the pages and the scroll position.
export const useRefreshAllLists = () => {
  const client = useQueryClient();
  return async (): Promise<void> => {
    await markReadQueue.flush();
    await refreshCountsThenLists({
      client,
      refreshLists: async () =>
        Promise.all(
          [["stream"], ["search"], ["entry"]].map(async (queryKey) =>
            client.invalidateQueries({ queryKey }),
          ),
        ),
    });
  };
};

const findCachedEntry = ({
  client,
  entryId,
}: {
  client: QueryClient;
  entryId: string;
}): Entry | undefined => {
  const streamQueries = client.getQueriesData<InfiniteData<EntryPage>>({ queryKey: ["stream"] });
  for (const [, data] of streamQueries) {
    for (const page of data?.pages ?? []) {
      const found = page.items.find((item) => item.id === entryId);
      if (found) return found;
    }
  }
  return undefined;
};

export const useEntry = (entryId: string) => {
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.entry(entryId),
    queryFn: async () => getEntry(entryId),
    initialData: () => findCachedEntry({ client, entryId }),
  });
};

// `query` must already be debounced (~400ms) by the caller — this hook fires as soon as it's
// enabled, it does no timing of its own.
export const useFeedLookup = (query: string) =>
  useQuery({
    queryKey: keys.feedLookup(query),
    queryFn: async () => searchFeeds(query),
    enabled: query.trim().length > 3,
  });

type CachedPages = readonly [readonly unknown[], InfiniteData<EntryPage> | undefined];

// The infinite caches holding entries: plain streams and in-stream article searches.
const ENTRY_CACHE_PREFIXES = [["stream"], ["search"]] as const;

const isUnreadOnlyListKey = (queryKey: readonly unknown[]): boolean => {
  const params = queryKey.at(-1);
  return (
    ENTRY_CACHE_PREFIXES.some(([prefix]) => prefix === queryKey[0]) &&
    typeof params === "object" &&
    params !== null &&
    "unreadOnly" in params &&
    params.unreadOnly === true
  );
};

// `setQueryData` clears `isInvalidated`; re-mark the unread-only lists that were stale so an optimistic write does not hide the entries they are missing.
const keepUnreadListsStale = (client: QueryClient, write: () => void): void => {
  const stale = new Set(
    client
      .getQueryCache()
      .findAll({
        predicate: ({ queryKey, state }) => state.isInvalidated && isUnreadOnlyListKey(queryKey),
      })
      .map(({ queryHash }) => queryHash),
  );
  write();
  if (stale.size === 0) return;
  void client.invalidateQueries({
    predicate: ({ queryHash }) => stale.has(queryHash),
    refetchType: "none",
  });
};

const shiftUnreadCounts = ({
  client,
  entries,
  delta,
}: {
  client: QueryClient;
  entries: Entry[];
  delta: 1 | -1;
}): void => {
  const counts = client.getQueryData<Counts>(keys.counts);
  if (!counts || entries.length === 0) return;
  const categories = client.getQueryData<Category[]>(keys.categories) ?? [];
  const shifted = (value: number | undefined, by: number) => Math.max(0, (value ?? 0) + by);
  const next: Counts = {
    ...counts,
    all: shifted(counts.all, delta * entries.length),
    feeds: { ...counts.feeds },
    categories: { ...counts.categories },
  };
  for (const { feedId } of entries) {
    next.feeds[feedId] = shifted(next.feeds[feedId], delta);
    for (const category of categories) {
      if (category.feedIds.includes(feedId))
        next.categories[category.id] = shifted(next.categories[category.id], delta);
    }
  }
  client.setQueryData<Counts>(keys.counts, next);
};

// Reads go through the batching queue, so the mutation settles when its batch went upstream.
// Unreads go at once, and pull the same ids out of a batch still waiting.
const whenOnline = async (): Promise<void> => {
  if (onlineManager.isOnline()) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = onlineManager.subscribe((online) => {
      if (!online) return;
      unsubscribe();
      resolve();
    });
  });
};

const sendMark = async ({ entryIds, read }: { entryIds: string[]; read: boolean }) => {
  if (read) return markReadQueue.add(entryIds);
  // Before the cancel, so a queued read stays stored until the unread can go out.
  await whenOnline();
  await markReadQueue.cancel(entryIds);
  return markUnread({ entryIds });
};

export const useMarkRead = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: sendMark,
    // Offline, a paused mutation would never reach the queue, so the read would not be stored.
    networkMode: "always",
    onMutate: async ({ entryIds, read }: { entryIds: string[]; read: boolean }) => {
      // Search results are the same entries under a different key prefix, so they take the same
      // optimistic flip (and the same rollback) as the plain stream caches. The counts go too: a
      // fetch in flight would land over the decrement.
      await Promise.all(
        [...ENTRY_CACHE_PREFIXES, keys.counts].map(async (queryKey) =>
          client.cancelQueries({ queryKey }),
        ),
      );

      const previousStreams: CachedPages[] = ENTRY_CACHE_PREFIXES.flatMap((prefix) =>
        client.getQueriesData<InfiniteData<EntryPage>>({ queryKey: prefix }),
      );
      const previousEntries = new Map<string, Entry | undefined>(
        entryIds.map((entryId) => [entryId, client.getQueryData<Entry>(keys.entry(entryId))]),
      );

      // First occurrence wins: an entry cached in several stream caches (e.g. `all` and its
      // folder) must only count once toward the feed, category and all deltas below.
      const changedEntries = new Map<string, Entry>();
      for (const [, data] of previousStreams) {
        for (const page of data?.pages ?? []) {
          for (const item of page.items) {
            if (entryIds.includes(item.id) && item.unread === read && !changedEntries.has(item.id))
              changedEntries.set(item.id, item);
          }
        }
      }

      keepUnreadListsStale(client, () => {
        for (const [queryKey, data] of previousStreams) {
          if (!data) continue;
          client.setQueryData<InfiniteData<EntryPage>>(queryKey, {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                entryIds.includes(item.id) ? { ...item, unread: !read } : item,
              ),
            })),
          });
        }
      });

      for (const entryId of entryIds) {
        client.setQueryData<Entry>(keys.entry(entryId), (prev) =>
          prev ? { ...prev, unread: !read } : prev,
        );
      }

      shiftUnreadCounts({ client, entries: [...changedEntries.values()], delta: read ? -1 : 1 });

      return { previousStreams, previousEntries, changedEntries: [...changedEntries.values()] };
    },
    // Undoes only this mutation's flips: restoring the whole snapshot would also undo marks that
    // landed on other entries since.
    onError: (_error, { entryIds, read }, context) => {
      if (!context) return;
      const failed = new Set(entryIds);
      keepUnreadListsStale(client, () => {
        for (const [queryKey, previous] of context.previousStreams) {
          const previousUnread = new Map<string, boolean>(
            previous?.pages.flatMap((page) => page.items.map((item) => [item.id, item.unread])),
          );
          client.setQueryData<InfiniteData<EntryPage>>(
            queryKey,
            (data) =>
              data && {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) => {
                    const unread = failed.has(item.id) ? previousUnread.get(item.id) : undefined;
                    return unread === undefined ? item : { ...item, unread };
                  }),
                })),
              },
          );
        }
      });
      for (const [entryId, previous] of context.previousEntries) {
        client.setQueryData<Entry>(keys.entry(entryId), (entry) =>
          entry && previous ? { ...entry, unread: previous.unread } : entry,
        );
      }
      shiftUnreadCounts({ client, entries: context.changedEntries, delta: read ? 1 : -1 });
    },
    onSettled: (_data, _error, { read }) => {
      void client.invalidateQueries({ queryKey: keys.counts });
      // An entry marked unread was absent from unread-only lists; stale only, so the open view does not jump.
      if (!read) {
        void client.invalidateQueries({
          predicate: ({ queryKey }) => isUnreadOnlyListKey(queryKey),
          refetchType: "none",
        });
      }
    },
  });
};

const invalidateLibrary = (client: QueryClient): void => {
  void client.invalidateQueries({ queryKey: keys.categories });
  void client.invalidateQueries({ queryKey: keys.feeds });
  void client.invalidateQueries({ queryKey: keys.counts });
};

export const useSubscribe = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createFeed,
    onSuccess: () => {
      invalidateLibrary(client);
    },
  });
};

// The address is fixed per account, so one GET per session.
export const useNewsletterAddress = () =>
  useQuery({
    queryKey: keys.newsletterAddress,
    queryFn: getNewsletterAddress,
    staleTime: Infinity,
  });

export const useUnsubscribe = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteFeed,
    onSuccess: () => {
      invalidateLibrary(client);
    },
  });
};

export const useCreateCategory = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      invalidateLibrary(client);
    },
  });
};

const cancelLibrary = async (client: QueryClient): Promise<void> => {
  await Promise.all(
    [keys.categories, keys.feeds].map(async (queryKey) => client.cancelQueries({ queryKey })),
  );
};

const setCategoryLabel = ({
  client,
  categoryId,
  label,
}: {
  client: QueryClient;
  categoryId: string;
  label: string;
}): void => {
  client.setQueryData<Category[]>(keys.categories, (categories) =>
    categories?.map((category) => (category.id === categoryId ? { ...category, label } : category)),
  );
};

// The id is the folder title, so a rename moves it everywhere it keys something, as the Worker
// does for the stored order.
const moveCategoryId = ({
  client,
  from,
  renamed,
}: {
  client: QueryClient;
  from: string;
  renamed: Category;
}): void => {
  const to = renamed.id;
  client.setQueryData<Category[]>(keys.categories, (categories) =>
    categories?.map((category) => (category.id === from ? renamed : category)),
  );
  if (from === to) return;
  client.setQueryData<Feed[]>(keys.feeds, (feeds) =>
    feeds?.map((feed) =>
      feed.categoryIds.includes(from)
        ? { ...feed, categoryIds: feed.categoryIds.map((id) => (id === from ? to : id)) }
        : feed,
    ),
  );
  client.setQueryData<Counts>(keys.counts, (counts) => {
    if (!counts || !(from in counts.categories)) return counts;
    const { [from]: count, ...others } = counts.categories;
    return { ...counts, categories: { ...others, [to]: count } };
  });
  client.setQueryData<Preferences>(keys.preferences, (preferences) => {
    const stored = preferences?.[CATEGORY_ORDER_KEY];
    if (typeof stored !== "string") return preferences;
    try {
      const order: unknown = JSON.parse(stored);
      if (!Array.isArray(order)) return preferences;
      return {
        ...preferences,
        [CATEGORY_ORDER_KEY]: JSON.stringify(order.map((id: unknown) => (id === from ? to : id))),
      };
    } catch {
      return preferences;
    }
  });
};

export const useRenameCategory = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: renameCategory,
    onMutate: async ({ categoryId, label }: { categoryId: string; label: string }) => {
      await cancelLibrary(client);
      const previous = client
        .getQueryData<Category[]>(keys.categories)
        ?.find((category) => category.id === categoryId)?.label;
      setCategoryLabel({ client, categoryId, label });
      return { previous };
    },
    onError: (_error, { categoryId }, context) => {
      if (context?.previous === undefined) return;
      setCategoryLabel({ client, categoryId, label: context.previous });
    },
    onSuccess: (renamed, { categoryId }) => {
      moveCategoryId({ client, from: categoryId, renamed });
    },
    onSettled: () => {
      invalidateLibrary(client);
      void client.invalidateQueries({ queryKey: keys.preferences });
    },
  });
};

export const useDeleteCategory = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      invalidateLibrary(client);
    },
  });
};

const writeFeed = ({
  client,
  feedId,
  title,
  categoryIds,
}: {
  client: QueryClient;
  feedId: string;
  title?: string;
  categoryIds?: string[];
}): void => {
  client.setQueryData<Feed[]>(keys.feeds, (feeds) =>
    feeds?.map((feed) =>
      feed.id === feedId
        ? { ...feed, title: title ?? feed.title, categoryIds: categoryIds ?? feed.categoryIds }
        : feed,
    ),
  );
  if (categoryIds === undefined) return;
  client.setQueryData<Category[]>(keys.categories, (categories) =>
    categories?.map((category) => {
      const member = category.feedIds.includes(feedId);
      if (member === categoryIds.includes(category.id)) return category;
      return {
        ...category,
        feedIds: member
          ? category.feedIds.filter((id) => id !== feedId)
          : [...category.feedIds, feedId],
      };
    }),
  );
};

// Saves the title and the whole category set in one PATCH. The rollback restores this feed only,
// so a save of another feed meanwhile keeps its own optimistic value.
const UPDATE_FEED_KEY = ["updateFeed"] as const;

export const useUpdateFeed = () => {
  const client = useQueryClient();
  return useMutation({
    mutationKey: UPDATE_FEED_KEY,
    mutationFn: updateFeed,
    onMutate: async (patch: { feedId: string; title?: string; categoryIds?: string[] }) => {
      await cancelLibrary(client);
      const previous = client
        .getQueryData<Feed[]>(keys.feeds)
        ?.find((feed) => feed.id === patch.feedId);
      writeFeed({ client, ...patch });
      return { previous };
    },
    onError: (_error, { feedId }, context) => {
      if (!context?.previous) return;
      const { title, categoryIds } = context.previous;
      writeFeed({ client, feedId, title, categoryIds });
    },
    onSuccess: (saved) => {
      client.setQueryData<Feed[]>(keys.feeds, (feeds) =>
        feeds?.map((feed) => (feed.id === saved.id ? saved : feed)),
      );
      writeFeed({ client, feedId: saved.id, categoryIds: saved.categoryIds });
    },
    onSettled: () => {
      invalidateLibrary(client);
    },
  });
};

export const useSavingFeed = (): boolean => useIsMutating({ mutationKey: UPDATE_FEED_KEY }) > 0;

export class DeleteAndMoveError extends Error {
  readonly moved: number;

  constructor({ moved, cause }: { moved: number; cause: unknown }) {
    super(`Delete and move stopped after ${moved} feed(s)`, { cause });
    this.name = "DeleteAndMoveError";
    this.moved = moved;
  }
}

// `moveAll` hands the move to the Worker (`moveTo`). Otherwise only the orphans move: each PATCH
// keeps `categoryId` in the set, so a failure partway leaves every feed in the doomed category and
// a retry is safe; the final DELETE strips it, and a feed filed elsewhere too just loses it.
export const useDeleteCategoryAndMove = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categoryId,
      targetId,
      moveAll,
    }: {
      categoryId: string;
      targetId: string;
      moveAll: boolean;
    }) => {
      // Moving into the doomed category adds nothing, so the DELETE would drop every orphan.
      if (targetId === categoryId)
        throw new Error("Pick a category other than the one being deleted.");
      if (moveAll) {
        await deleteCategory({ categoryId, moveTo: targetId });
        return;
      }
      const feeds = client.getQueryData<Feed[]>(keys.feeds) ?? (await getFeeds());
      let moved = 0;
      for (const feed of orphansOf({ feeds, categoryId })) {
        try {
          await updateFeed({ feedId: feed.id, categoryIds: [...feed.categoryIds, targetId] });
        } catch (error) {
          throw new DeleteAndMoveError({ moved, cause: error });
        }
        moved += 1;
      }
      await deleteCategory({ categoryId });
    },
    onSettled: () => {
      invalidateLibrary(client);
    },
  });
};
