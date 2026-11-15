import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { getEntry } from "client/api/client";
import { keys } from "client/api/keys";
import type { Entry, EntryPage } from "shared/feedsApi/types";

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
