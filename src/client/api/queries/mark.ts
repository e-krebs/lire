import { hashKey, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { keys } from "client/api/keys";
import { markQueue } from "client/api/markQueue";
import type { Category, Counts, Entry, EntryPage } from "shared/feedsApi/types";

export const MARK_KEY = ["mark"] as const;

type CachedPages = readonly [readonly unknown[], InfiniteData<EntryPage> | undefined];

// The infinite caches holding entries: plain streams and in-stream article searches.
const ENTRY_CACHE_PREFIXES = [["stream"], ["search"]] as const;

const isEntryListKey = (queryKey: readonly unknown[]): boolean =>
  ENTRY_CACHE_PREFIXES.some(([prefix]) => prefix === queryKey[0]);

// Any mark can move an entry into or out of any list (unread-only, Recently read, all); stale only,
// so the open view does not jump. Done at mark time too: the mutation settles when its batch goes
// upstream, up to MARK_DELAY_MS later, and a list opened before that would otherwise stay fresh.
// The list marked from stays fresh: left stale, a remount or filter flip would refetch it and drop
// the entry.
const staleEntryLists = ({
  client,
  freshHash,
}: {
  client: QueryClient;
  freshHash: string | undefined;
}): void => {
  void client.invalidateQueries({
    predicate: (query) => isEntryListKey(query.queryKey) && query.queryHash !== freshHash,
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

interface MarkVariables {
  entryIds: string[];
  read: boolean;
  // The `keys.stream` or `keys.search` key of the list marked from; absent stales every list.
  sourceKey?: readonly unknown[];
}

// Both marks go through the batching queue, so the mutation settles when its batch went upstream.
const sendMark = async ({ entryIds, read }: MarkVariables) => markQueue.mark({ entryIds, read });

export const useMark = () => {
  const client = useQueryClient();
  return useMutation({
    mutationKey: MARK_KEY,
    mutationFn: sendMark,
    meta: { notifyOnFailure: true },
    // Offline, a paused mutation would never reach the queue, so the read would not be stored.
    networkMode: "always",
    onMutate: async ({ entryIds, read, sourceKey }: MarkVariables) => {
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

      // Resolved now so settle-time staling holds even once that list unmounts. A source list already
      // stale stays stale: the optimistic write below clears its flag.
      const sourceHash = sourceKey && hashKey(sourceKey);
      const freshHash =
        sourceHash !== undefined &&
        client.getQueryCache().get(sourceHash)?.state.isInvalidated !== true
          ? sourceHash
          : undefined;
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

      // After the writes: `setQueryData` clears `isInvalidated`.
      staleEntryLists({ client, freshHash });

      for (const entryId of entryIds) {
        client.setQueryData<Entry>(keys.entry(entryId), (prev) =>
          prev ? { ...prev, unread: !read } : prev,
        );
      }

      shiftUnreadCounts({ client, entries: [...changedEntries.values()], delta: read ? -1 : 1 });

      return {
        previousStreams,
        previousEntries,
        changedEntries: [...changedEntries.values()],
        freshHash,
      };
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
      staleEntryLists({ client, freshHash: context.freshHash });
    },
    onSettled: (_data, _error, _variables, context) => {
      void client.invalidateQueries({ queryKey: keys.counts });
      staleEntryLists({ client, freshHash: context?.freshHash });
    },
  });
};
