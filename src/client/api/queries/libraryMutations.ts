import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  createCategory,
  deleteCategory,
  getFeeds,
  renameCategory,
  updateFeed,
} from "client/api/client";
import { keys } from "client/api/keys";
import { orphansOf } from "client/api/selectors";
import { CATEGORY_ORDER_KEY } from "shared/feedsApi/preferences";
import type { Category, Counts, Feed, Preferences } from "shared/feedsApi/types";
import { invalidateLibrary } from "./shared";

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
    meta: { notifyOnFailure: true },
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
    meta: { notifyOnFailure: true },
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
