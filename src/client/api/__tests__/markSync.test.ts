import { describe, expect, it, vi } from "vitest";
import { markStore, type MarkRow } from "../markStore";
import { syncPending } from "../markSync";

type MarkBatch = { read: string[]; unread: string[]; userId: number };

const setup = ({ stored, userId = 7 }: { stored: MarkRow[]; userId?: number }) => {
  const store = {
    all: vi.fn<() => Promise<MarkRow[]>>(async () => {
      await Promise.resolve();
      return stored;
    }),
    removeUnchanged: vi.fn<(rows: MarkRow[]) => Promise<void>>(async () => {
      await Promise.resolve();
    }),
  };
  const post = vi.fn<(marks: MarkBatch) => Promise<void>>(async () => {
    await Promise.resolve();
  });
  const currentUserId = vi.fn<() => Promise<number>>(async () => {
    await Promise.resolve();
    return userId;
  });
  return { store, post, currentUserId };
};

describe("syncPending", () => {
  it("makes no call when nothing is stored", async () => {
    const { store, post, currentUserId } = setup({ stored: [] });

    await syncPending({ store, post, currentUserId });

    expect(post).not.toHaveBeenCalled();
    expect(store.removeUnchanged).not.toHaveBeenCalled();
  });

  it("posts both lists, then removes the rows it sent", async () => {
    const stored: MarkRow[] = [
      { id: "101:a", state: "read" },
      { id: "101:b", state: "unread" },
      { id: "101:c", state: "read" },
    ];
    const { store, post, currentUserId } = setup({ stored });

    await syncPending({ store, post, currentUserId });

    expect(post).toHaveBeenCalledWith({ read: ["101:a", "101:c"], unread: ["101:b"], userId: 7 });
    expect(store.removeUnchanged).toHaveBeenCalledWith(stored);
  });

  it("keeps a row marked again while the post was in flight", async () => {
    vi.stubEnv("VITE_API_MODE", "real");
    await markStore.add([
      { id: "101:a", state: "read" },
      { id: "101:b", state: "read" },
    ]);

    await syncPending({
      currentUserId: async () => Promise.resolve(7),
      store: markStore,
      post: async () => markStore.add([{ id: "101:a", state: "unread" }]),
    });

    expect(await markStore.all()).toEqual([{ id: "101:a", state: "unread" }]);
  });

  it("keeps the ids and rethrows when the send fails", async () => {
    const { store, post, currentUserId } = setup({ stored: [{ id: "101:a", state: "read" }] });
    post.mockReturnValueOnce(Promise.reject(new Error("offline")));

    await expect(syncPending({ store, post, currentUserId })).rejects.toThrow("offline");
    expect(store.removeUnchanged).not.toHaveBeenCalled();
  });

  it("removes the rows of another user unsent and posts the rest, adopting untagged rows", async () => {
    const stored: MarkRow[] = [
      { id: "101:a", state: "read", userId: 8 },
      { id: "101:b", state: "read", userId: 7 },
      { id: "101:c", state: "unread" },
    ];
    const { store, post, currentUserId } = setup({ stored });

    await syncPending({ store, post, currentUserId });

    expect(post).toHaveBeenCalledWith({ read: ["101:b"], unread: ["101:c"], userId: 7 });
    expect(store.removeUnchanged).toHaveBeenNthCalledWith(1, [stored[0]]);
    expect(store.removeUnchanged).toHaveBeenNthCalledWith(2, [stored[1], stored[2]]);
  });

  it("posts nothing when every row belongs to another user", async () => {
    const { store, post, currentUserId } = setup({
      stored: [{ id: "101:a", state: "read", userId: 8 }],
    });

    await syncPending({ store, post, currentUserId });

    expect(post).not.toHaveBeenCalled();
    expect(store.removeUnchanged).toHaveBeenCalledTimes(1);
  });

  it("keeps every row and rethrows when the user cannot be read", async () => {
    const { store, post } = setup({ stored: [{ id: "101:a", state: "read", userId: 8 }] });

    await expect(
      syncPending({
        store,
        post,
        currentUserId: async () => Promise.reject(new Error("signed out")),
      }),
    ).rejects.toThrow("signed out");
    expect(post).not.toHaveBeenCalled();
    expect(store.removeUnchanged).not.toHaveBeenCalled();
  });
});
