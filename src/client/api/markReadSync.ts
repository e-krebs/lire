import type { markReadStore } from "./markReadStore";

type Store = Pick<typeof markReadStore, "all" | "remove">;

export const syncPending = async ({
  store,
  post,
}: {
  store: Store;
  post: (ids: string[]) => Promise<void>;
}): Promise<void> => {
  const ids = await store.all();
  if (ids.length === 0) return;
  await post(ids);
  await store.remove(ids);
};
