import type { markStore } from "./markStore";

type Store = Pick<typeof markStore, "all" | "removeUnchanged">;

// Rows of another user go away unsent. An untagged row is sent as the current user's.
export const syncPending = async ({
  store,
  post,
  currentUserId,
}: {
  store: Store;
  post: (marks: { read: string[]; unread: string[]; userId: number }) => Promise<void>;
  currentUserId: () => Promise<number>;
}): Promise<void> => {
  const rows = await store.all();
  if (rows.length === 0) return;
  const userId = await currentUserId();
  const foreign = rows.filter((row) => row.userId !== undefined && row.userId !== userId);
  if (foreign.length > 0) await store.removeUnchanged(foreign);
  const own = rows.filter((row) => !foreign.includes(row));
  if (own.length === 0) return;
  const idsOf = (state: string) => own.filter((row) => row.state === state).map(({ id }) => id);
  await post({ read: idsOf("read"), unread: idsOf("unread"), userId });
  await store.removeUnchanged(own);
};
