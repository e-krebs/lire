import type { markStore } from "./markStore";

type Store = Pick<typeof markStore, "all" | "removeUnchanged">;

export const syncPending = async ({
  store,
  post,
}: {
  store: Store;
  post: (marks: { read: string[]; unread: string[] }) => Promise<void>;
}): Promise<void> => {
  const rows = await store.all();
  if (rows.length === 0) return;
  const idsOf = (state: string) => rows.filter((row) => row.state === state).map(({ id }) => id);
  await post({ read: idsOf("read"), unread: idsOf("unread") });
  await store.removeUnchanged(rows);
};
