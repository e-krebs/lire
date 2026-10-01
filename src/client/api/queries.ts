import {
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import {
  addFeedToCollection,
  ApiError,
  createCollection,
  createNewsletterAddress,
  deleteCollection,
  getAuthStatus,
  getCollections,
  getEntry,
  getProfile,
  getStream,
  getPreferences,
  getSubscriptions,
  getUnreadCounts,
  markEntries,
  postSubscription,
  renameCollection,
  searchContents,
  searchFeeds,
  subscribe,
  unsubscribe,
  updatePreferences,
  PREFERENCE_DELETE,
} from "client/api/client";
import {
  CATEGORIES_ORDERING_KEY,
  feedsInCategory,
  orderCollections,
  orphansOf,
} from "client/api/selectors";
import type {
  Entry,
  MarkerCounts,
  Preferences,
  StreamContents,
  Subscription,
} from "shared/feedsApi/types";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export const keys = {
  authStatus: ["authStatus"] as const,
  profile: ["profile"] as const,
  collections: ["collections"] as const,
  subscriptions: ["subscriptions"] as const,
  unreadCounts: ["unreadCounts"] as const,
  preferences: ["preferences"] as const,
  stream: ({
    streamId,
    unreadOnly,
    ranked,
  }: {
    streamId: string;
    unreadOnly?: boolean;
    ranked?: "newest" | "oldest";
  }) =>
    ["stream", streamId, { unreadOnly: unreadOnly ?? false, ranked: ranked ?? "newest" }] as const,
  search: ({
    streamId,
    query,
    unreadOnly,
  }: {
    streamId: string;
    query: string;
    unreadOnly?: boolean;
  }) => ["search", streamId, query, { unreadOnly: unreadOnly ?? false }] as const,
  entry: (entryId: string) => ["entry", entryId] as const,
  feedLookup: (query: string) => ["feedLookup", query] as const,
};

export const isSignInRequired = (error: unknown): boolean =>
  error instanceof ApiError && error.code === "sign_in_required";

export const unreadCountFor = ({
  counts,
  id,
}: {
  counts: MarkerCounts | undefined;
  id: string | undefined;
}): number =>
  id === undefined ? 0 : (counts?.unreadcounts.find((entry) => entry.id === id)?.count ?? 0);

export const useAuthStatus = () => useQuery({ queryKey: keys.authStatus, queryFn: getAuthStatus });

export const useProfile = () => useQuery({ queryKey: keys.profile, queryFn: getProfile });

export const useCollections = () =>
  useQuery({ queryKey: keys.collections, queryFn: getCollections });

export const useSubscriptions = () =>
  useQuery({ queryKey: keys.subscriptions, queryFn: getSubscriptions });

export const useUnreadCounts = () =>
  useQuery({
    queryKey: keys.unreadCounts,
    queryFn: getUnreadCounts,
    refetchInterval: FIVE_MINUTES_MS,
  });

export const DIRECT_OPEN_STORAGE_KEY = "lire.directOpen";

// The flag used to live in local storage; lift whatever is left over into the account bucket once,
// so a device that had it set keeps it and every other device picks it up.
const migratedDirectOpenIds = (): string[] => {
  try {
    const raw = window.localStorage.getItem(DIRECT_OPEN_STORAGE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    // Blocked storage or a hand-edited value: nothing to migrate.
    return [];
  }
};

const forgetDirectOpenStorage = (): void => {
  try {
    window.localStorage.removeItem(DIRECT_OPEN_STORAGE_KEY);
  } catch {
    // A private window: the account bucket already holds the flags.
  }
};

const loadPreferences = async (): Promise<Preferences> => {
  const store = await getPreferences();
  const ids = migratedDirectOpenIds();
  if (ids.length === 0) return store;

  const patch: Record<string, string> = {};
  for (const id of ids) {
    const key = `subscription/${id}/entryNavigation`;
    if (store[key] !== "visit") patch[key] = "visit";
  }
  const merged = Object.keys(patch).length > 0 ? await updatePreferences(patch) : store;
  forgetDirectOpenStorage();
  return merged;
};

// One GET per session: the bucket only changes through this app's own toggles, which write the
// answer straight back into the cache.
export const usePreferences = () =>
  useQuery({
    queryKey: keys.preferences,
    queryFn: loadPreferences,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

// Holds the rows until the stored order is known, so they never show in API order first. A failed
// load counts as settled: preferences fall back to API order, collections to no rows.
export const useOrderedCollections = () => {
  const collections = useCollections();
  const preferences = usePreferences();
  return {
    collections: orderCollections({
      collections: collections.data ?? [],
      preferences: preferences.data,
    }),
    ready: !collections.isPending && !preferences.isPending,
  };
};

// Each write echoes the whole store, so the scope sends them one at a time. Every onMutate still
// runs at once, so a snapshot can hold an earlier write's optimistic value: only the last write in
// the queue settles the cache, and a failed one that overlapped refetches the store.
export const useUpdatePreferences = () => {
  const client = useQueryClient();
  const othersPending = () => client.isMutating({ mutationKey: keys.preferences }) - 1;
  return useMutation({
    mutationKey: keys.preferences,
    scope: { id: "preferences" },
    mutationFn: updatePreferences,
    onMutate: async (patch: Record<string, string>) => {
      const overlapped = othersPending() > 0;
      await client.cancelQueries({ queryKey: keys.preferences });
      const previous = client.getQueryData<Preferences>(keys.preferences);
      client.setQueryData<Preferences>(keys.preferences, (prev) => {
        const next: Preferences = { ...prev };
        for (const [key, value] of Object.entries(patch)) {
          if (value === PREFERENCE_DELETE) delete next[key];
          else next[key] = value;
        }
        return next;
      });
      return { previous, overlapped };
    },
    onError: (_error, _patch, context) => {
      if (!context || othersPending() > 0) return;
      client.setQueryData(keys.preferences, context.previous);
      if (context.overlapped) void client.invalidateQueries({ queryKey: keys.preferences });
    },
    onSuccess: (store) => {
      if (othersPending() === 0) client.setQueryData<Preferences>(keys.preferences, store);
    },
  });
};

export const useSavingPreferences = (): boolean =>
  useIsMutating({ mutationKey: keys.preferences }) > 0;

export const useReorderCategories = () => {
  const update = useUpdatePreferences();
  const toPatch = ({ categoryIds }: { categoryIds: string[] }) => ({
    [CATEGORIES_ORDERING_KEY]: JSON.stringify(categoryIds),
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

export const flattenStream = (data: InfiniteData<StreamContents> | undefined): Entry[] =>
  data ? data.pages.flatMap((page) => page.items) : [];

export const useStream = ({
  streamId,
  unreadOnly,
  ranked,
  enabled = true,
}: {
  streamId: string;
  unreadOnly?: boolean;
  ranked?: "newest" | "oldest";
  enabled?: boolean;
}) =>
  useInfiniteQuery({
    queryKey: keys.stream({ streamId, unreadOnly, ranked }),
    queryFn: async ({ pageParam }) =>
      getStream({ streamId, unreadOnly, ranked, continuation: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.continuation,
    enabled,
  });

export const MIN_SEARCH_LENGTH = 2;

// `query` must already be debounced by the caller, like `useFeedLookup`.
export const useSearchContents = ({
  streamId,
  query,
  unreadOnly,
  enabled = true,
}: {
  streamId: string;
  query: string;
  unreadOnly?: boolean;
  enabled?: boolean;
}) =>
  useInfiniteQuery({
    queryKey: keys.search({ streamId, query, unreadOnly }),
    queryFn: async ({ pageParam }) =>
      searchContents({ streamId, query, unreadOnly, continuation: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.continuation,
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
  client.setQueryData<InfiniteData<StreamContents>>(
    queryKey,
    (data) => data && { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
  );
  await Promise.all([
    client.refetchQueries({ queryKey, exact: true }),
    client.invalidateQueries({ queryKey: keys.unreadCounts }),
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
  const streamQueries = client.getQueriesData<InfiniteData<StreamContents>>({
    queryKey: ["stream"],
  });
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

type StreamEntry = readonly [readonly unknown[], InfiniteData<StreamContents> | undefined];

const GLOBAL_ALL_SUFFIX = "/category/global.all";

// The infinite caches holding entries: plain streams and in-stream article searches.
const ENTRY_CACHE_PREFIXES = [["stream"], ["search"]] as const;

export const useMarkRead = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: markEntries,
    onMutate: async ({ entryIds, read }: { entryIds: string[]; read: boolean }) => {
      // Search results are the same entries under a different key prefix, so they take the same
      // optimistic flip (and the same rollback) as the plain stream caches.
      await Promise.all(
        ENTRY_CACHE_PREFIXES.map(async (prefix) => client.cancelQueries({ queryKey: prefix })),
      );

      const previousStreams: StreamEntry[] = ENTRY_CACHE_PREFIXES.flatMap((prefix) =>
        client.getQueriesData<InfiniteData<StreamContents>>({ queryKey: prefix }),
      );
      const previousCounts = client.getQueryData<MarkerCounts>(keys.unreadCounts);
      const previousEntries = new Map<string, Entry | undefined>(
        entryIds.map((entryId) => [entryId, client.getQueryData<Entry>(keys.entry(entryId))]),
      );

      // First occurrence wins: an entry cached in several stream caches (e.g. `global.all` and its
      // category) must only count once toward the feed/category/global deltas below.
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
        client.setQueryData<InfiniteData<StreamContents>>(queryKey, {
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

      if (previousCounts && changedEntries.size > 0) {
        const delta = read ? -1 : 1;
        const subscriptions = client.getQueryData<Subscription[]>(keys.subscriptions);
        const categoriesByFeed = new Map<string, string[]>(
          subscriptions?.map((sub) => [sub.id, sub.categories.map((category) => category.id)]) ??
            [],
        );
        const nextCounts = new Map(
          previousCounts.unreadcounts.map((entry) => [entry.id, entry.count]),
        );
        let globalDelta = 0;
        for (const entry of changedEntries.values()) {
          const feedId = entry.origin.streamId;
          nextCounts.set(feedId, Math.max(0, (nextCounts.get(feedId) ?? 0) + delta));
          for (const categoryId of categoriesByFeed.get(feedId) ?? []) {
            nextCounts.set(categoryId, Math.max(0, (nextCounts.get(categoryId) ?? 0) + delta));
          }
          globalDelta += delta;
        }
        const globalEntry = previousCounts.unreadcounts.find((entry) =>
          entry.id.endsWith(GLOBAL_ALL_SUFFIX),
        );
        if (globalEntry) {
          nextCounts.set(
            globalEntry.id,
            Math.max(0, (nextCounts.get(globalEntry.id) ?? 0) + globalDelta),
          );
        }
        client.setQueryData<MarkerCounts>(keys.unreadCounts, {
          ...previousCounts,
          unreadcounts: previousCounts.unreadcounts.map((entry) => ({
            ...entry,
            count: nextCounts.get(entry.id) ?? entry.count,
          })),
        });
      }

      return { previousStreams, previousCounts, previousEntries };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      for (const [queryKey, data] of context.previousStreams) client.setQueryData(queryKey, data);
      if (context.previousCounts) client.setQueryData(keys.unreadCounts, context.previousCounts);
      for (const [entryId, entry] of context.previousEntries)
        client.setQueryData(keys.entry(entryId), entry);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.unreadCounts });
    },
  });
};

const invalidateSubscriptionData = (client: QueryClient): void => {
  void client.invalidateQueries({ queryKey: keys.collections });
  void client.invalidateQueries({ queryKey: keys.subscriptions });
  void client.invalidateQueries({ queryKey: keys.unreadCounts });
};

export const useSubscribe = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: subscribe,
    onSuccess: () => {
      invalidateSubscriptionData(client);
    },
  });
};

export const useCreateNewsletterAddress = () =>
  useMutation({ mutationFn: createNewsletterAddress });

export const useSubscribeNewsletter = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      feedId,
      title,
      categoryIds,
    }: {
      feedId: string;
      title: string;
      categoryIds: string[];
    }): Promise<void> => {
      const results = await Promise.allSettled(
        categoryIds.map(async (collectionId) =>
          addFeedToCollection({ collectionId, feedId, title }),
        ),
      );
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
    },
    onSettled: () => {
      invalidateSubscriptionData(client);
    },
  });
};

export const useUnsubscribe = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: unsubscribe,
    onSuccess: () => {
      invalidateSubscriptionData(client);
    },
  });
};

export const useCreateCollection = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createCollection,
    onSuccess: () => {
      invalidateSubscriptionData(client);
    },
  });
};

export const useRenameCollection = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: renameCollection,
    onSuccess: () => {
      invalidateSubscriptionData(client);
    },
  });
};

export const useDeleteCollection = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteCollection,
    onSuccess: () => {
      invalidateSubscriptionData(client);
    },
  });
};

export const useSaveSubscription = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: postSubscription,
    onSettled: () => {
      invalidateSubscriptionData(client);
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

// Each post keeps `categoryId` in the set, so a failure partway leaves every feed in the doomed
// category and a retry is safe; the final DELETE strips it.
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
      // Moving into the doomed category adds nothing, so the DELETE would unsubscribe every orphan.
      if (targetId === categoryId)
        throw new Error("Pick a category other than the one being deleted.");
      const subscriptions =
        client.getQueryData<Subscription[]>(keys.subscriptions) ?? (await getSubscriptions());
      const toMove = moveAll
        ? feedsInCategory({ subscriptions, categoryId })
        : orphansOf({ subscriptions, categoryId });
      let moved = 0;
      for (const subscription of toMove) {
        const oldIds = subscription.categories.map((category) => category.id);
        const categoryIds = oldIds.includes(targetId) ? oldIds : [...oldIds, targetId];
        try {
          await postSubscription({
            feedId: subscription.id,
            title: subscription.title,
            categoryIds,
          });
        } catch (error) {
          throw new DeleteAndMoveError({ moved, cause: error });
        }
        moved += 1;
      }
      await deleteCollection(categoryId);
    },
    onSettled: () => {
      invalidateSubscriptionData(client);
    },
  });
};
