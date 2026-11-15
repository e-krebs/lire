import { hashKey, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { dropFeedsCache } from "client/api/client";
import { keys } from "client/api/keys";
import { markQueue, settleWithin } from "client/api/markQueue";
import type { EntryPage } from "shared/feedsApi/types";
import { MARK_KEY } from "./mark";

// Counts and the library first and awaited: the counts query is often inactive, and parallel
// NewsBlur calls would let the count move without the list.
const refreshCountsThenLists = async ({
  client,
  refreshLists,
}: {
  client: QueryClient;
  refreshLists: () => Promise<unknown>;
}): Promise<void> => {
  await dropFeedsCache().catch(() => {});
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
  await settleWrites({ client });
  await refreshCountsThenLists({
    client,
    refreshLists: async () => client.refetchQueries({ queryKey, exact: true }),
  });
};

const SETTLE_WRITES_MS = 3000;

// Marks are left out: flush() covers them, and a mark mutation stays pending until its batch goes upstream.
const isMark = (mutation: { options: { mutationKey?: readonly unknown[] } }) =>
  mutation.options.mutationKey?.[0] === MARK_KEY[0];

const isWriting = ({ client }: { client: QueryClient }): boolean =>
  client.isMutating({ predicate: (mutation) => !isMark(mutation) }) > 0;

// A write still running would come back from the refetch as the state before it.
const settleWrites = async ({ client }: { client: QueryClient }): Promise<void> => {
  let unsubscribe = () => {};
  const mutationsDone = new Promise<void>((resolve) => {
    if (!isWriting({ client })) {
      resolve();
      return;
    }
    unsubscribe = client.getMutationCache().subscribe(() => {
      if (!isWriting({ client })) resolve();
    });
  });
  await settleWithin({
    promise: Promise.all([markQueue.flush(), mutationsDone]).then(
      () => {},
      () => {},
    ),
    ms: SETTLE_WRITES_MS,
  });
  unsubscribe();
};

export const useRefreshEntries = () => {
  const client = useQueryClient();
  return async ({ queryKey, trim = true }: { queryKey: readonly unknown[]; trim?: boolean }) =>
    refreshEntries({ client, queryKey, trim });
};

// The foreground return: `refreshList` refreshes the list on screen, then every other list, search
// and entry still mounted refetches.
export const useRefreshAllLists = () => {
  const client = useQueryClient();
  return async ({
    queryKey,
    refreshList,
  }: {
    queryKey: readonly unknown[];
    refreshList: () => Promise<void>;
  }): Promise<void> => {
    await refreshList();
    const own = hashKey(queryKey);
    await Promise.all(
      [["stream"], ["search"], ["entry"]].map(async (prefix) =>
        client.invalidateQueries({
          queryKey: prefix,
          refetchType: "active",
          predicate: (query) => query.queryHash !== own,
        }),
      ),
    );
  };
};
