import { describe, expect, it, vi } from "vitest";
import { syncPending } from "../markReadSync";

const setup = ({ stored }: { stored: string[] }) => {
  const store = {
    all: vi.fn<() => Promise<string[]>>(async () => {
      await Promise.resolve();
      return stored;
    }),
    remove: vi.fn<(ids: string[]) => Promise<void>>(async () => {
      await Promise.resolve();
    }),
  };
  const post = vi.fn<(ids: string[]) => Promise<void>>(async () => {
    await Promise.resolve();
  });
  return { store, post };
};

describe("syncPending", () => {
  it("makes no call when nothing is stored", async () => {
    const { store, post } = setup({ stored: [] });

    await syncPending({ store, post });

    expect(post).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("removes the ids once they are sent", async () => {
    const { store, post } = setup({ stored: ["101:a", "101:b"] });

    await syncPending({ store, post });

    expect(post).toHaveBeenCalledWith(["101:a", "101:b"]);
    expect(store.remove).toHaveBeenCalledWith(["101:a", "101:b"]);
  });

  it("keeps the ids and rethrows when the send fails", async () => {
    const { store, post } = setup({ stored: ["101:a"] });
    post.mockReturnValueOnce(Promise.reject(new Error("offline")));

    await expect(syncPending({ store, post })).rejects.toThrow("offline");
    expect(store.remove).not.toHaveBeenCalled();
  });
});
