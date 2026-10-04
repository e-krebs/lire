import {
  queryOptions,
  useInfiniteQuery,
  useIsMutating,
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
import { markReadQueue } from "client/api/markReadQueue";
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

export const useCounts = () =>
  useQuery({ queryKey: keys.counts, queryFn: getCounts, refetchInterval: FIVE_MINUTES_MS });

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
    queryFn: async ({ pageParam }) =>
      getStreamEntries({ streamKey, unreadOnly, order, count, cursor: pageParam }),
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
    queryFn: async ({ pageParam }) =>
      searchEntries({ streamKey, query, unreadOnly, count, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: enabled && query.trim().length >= MIN_SEARCH_LENGTH,
  });

// Refresh = the first page again, not every page: the trimmed cache keeps showing the old rows
// until the new first page lands, then the sentinel reloads the rest on scroll.
const refreshEntries = async ({
  client,
  queryKey,
}: {
  client: QueryClient;
  queryKey: readonly unknown[];
}): Promise<void> => {
  client.setQueryData<InfiniteData<EntryPage>>(
    queryKey,
    (data) => data && { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
  );
  // A mark still waiting in the queue would come back unread from the refetch.
  await markReadQueue.flush();
  await Promise.all([
    client.refetchQueries({ queryKey, exact: true }),
    client.invalidateQueries({ queryKey: keys.counts }),
  ]);
};

export const useRefreshEntries = () => {
  const client = useQueryClient();
  return async (queryKey: readonly unknown[]) => refreshEntries({ client, queryKey });
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
const sendMark = async ({ entryIds, read }: { entryIds: string[]; read: boolean }) => {
  if (read) return markReadQueue.add(entryIds);
  markReadQueue.cancel(entryIds);
  return markUnread({ entryIds });
};

export const useMarkRead = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: sendMark,
    onMutate: async ({ entryIds, read }: { entryIds: string[]; read: boolean }) => {
      // Search results are the same entries under a different key prefix, so they take the same
      // optimistic flip (and the same rollback) as the plain stream caches.
      await Promise.all(
        ENTRY_CACHE_PREFIXES.map(async (prefix) => client.cancelQueries({ queryKey: prefix })),
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
      for (const [entryId, previous] of context.previousEntries) {
        client.setQueryData<Entry>(keys.entry(entryId), (entry) =>
          entry && previous ? { ...entry, unread: previous.unread } : entry,
        );
      }
      shiftUnreadCounts({ client, entries: context.changedEntries, delta: read ? 1 : -1 });
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.counts });
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

export const useRenameCategory = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: renameCategory,
    onSuccess: () => {
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

// Saves the title and the whole category set in one PATCH.
export const useUpdateFeed = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateFeed,
    onSettled: () => {
      invalidateLibrary(client);
    },
  });
};

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
