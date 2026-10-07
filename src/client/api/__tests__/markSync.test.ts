import { describe, expect, it, vi } from "vitest";
import { markStore, type MarkRow } from "../markStore";
import { syncPending } from "../markSync";

const setup = ({ stored }: { stored: MarkRow[] }) => {
  const store = {
    all: vi.fn<() => Promise<MarkRow[]>>(async () => {
      await Promise.resolve();
      return stored;
    }),
    removeUnchanged: vi.fn<(rows: MarkRow[]) => Promise<void>>(async () => {
      await Promise.resolve();
    }),
  };
  const post = vi.fn<(marks: { read: string[]; unread: string[] }) => Promise<void>>(async () => {
    await Promise.resolve();
  });
  return { store, post };
};

describe("syncPending", () => {
  it("makes no call when nothing is stored", async () => {
    const { store, post } = setup({ stored: [] });

    await syncPending({ store, post });

    expect(post).not.toHaveBeenCalled();
    expect(store.removeUnchanged).not.toHaveBeenCalled();
  });

  it("posts both lists, then removes the rows it sent", async () => {
    const stored: MarkRow[] = [
      { id: "101:a", state: "read" },
      { id: "101:b", state: "unread" },
      { id: "101:c", state: "read" },
    ];
    const { store, post } = setup({ stored });

    await syncPending({ store, post });

    expect(post).toHaveBeenCalledWith({ read: ["101:a", "101:c"], unread: ["101:b"] });
    expect(store.removeUnchanged).toHaveBeenCalledWith(stored);
  });

  it("keeps a row marked again while the post was in flight", async () => {
    vi.stubEnv("VITE_API_MODE", "real");
    await markStore.add([
      { id: "101:a", state: "read" },
      { id: "101:b", state: "read" },
    ]);

    await syncPending({
      store: markStore,
      post: async () => markStore.add([{ id: "101:a", state: "unread" }]),
    });

    expect(await markStore.all()).toEqual([{ id: "101:a", state: "unread" }]);
  });

  it("keeps the ids and rethrows when the send fails", async () => {
    const { store, post } = setup({ stored: [{ id: "101:a", state: "read" }] });
    post.mockReturnValueOnce(Promise.reject(new Error("offline")));

    await expect(syncPending({ store, post })).rejects.toThrow("offline");
    expect(store.removeUnchanged).not.toHaveBeenCalled();
  });
});
