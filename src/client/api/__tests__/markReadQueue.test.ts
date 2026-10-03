import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "test/msw";
import {
  createMarkReadQueue,
  MARK_READ_BATCH_SIZE,
  MARK_READ_DELAY_MS,
  markReadQueue,
} from "../markReadQueue";

const setup = ({ fail = false }: { fail?: boolean } = {}) => {
  const sent: { entryIds: string[]; keepalive: boolean }[] = [];
  const queue = createMarkReadQueue({
    send: async (batch) => {
      sent.push(batch);
      return fail ? Promise.reject(new Error("boom")) : Promise.resolve();
    },
  });
  return { queue, sent };
};

const ids = (count: number): string[] => Array.from({ length: count }, (_, i) => `101:${i}`);

describe("markReadQueue", () => {
  it("sends at once when the batch fills", async () => {
    const { queue, sent } = setup();

    void queue.add(ids(MARK_READ_BATCH_SIZE - 1));
    expect(sent).toEqual([]);
    await queue.add(["102:a", "102:a"]);

    expect(sent).toEqual([{ entryIds: [...ids(4), "102:a"], keepalive: false }]);
  });

  it("sends a partial batch after the delay", async () => {
    vi.useFakeTimers();
    const { queue, sent } = setup();

    const settled = queue.add(["101:a"]);
    vi.advanceTimersByTime(MARK_READ_DELAY_MS - 1);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    await settled;

    expect(sent).toEqual([{ entryIds: ["101:a"], keepalive: false }]);
  });

  it("flushes on demand as keepalive, and resolves an empty flush without sending", async () => {
    const { queue, sent } = setup();

    const settled = queue.add(["101:a"]);
    await queue.flush({ keepalive: true });
    await settled;
    await queue.flush();

    expect(sent).toEqual([{ entryIds: ["101:a"], keepalive: true }]);
  });

  it("drops a cancelled id from the waiting batch", async () => {
    const { queue, sent } = setup();

    const settled = queue.add(["101:a", "101:b"]);
    queue.cancel(["101:a"]);
    await queue.flush();
    await settled;

    expect(sent).toEqual([{ entryIds: ["101:b"], keepalive: false }]);
  });

  it("resolves a batch emptied by cancel without sending", async () => {
    const { queue, sent } = setup();

    const settled = queue.add(["101:a"]);
    queue.cancel(["101:a"]);
    await queue.flush();

    await expect(settled).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });

  it("rejects every waiter of a failed batch", async () => {
    const { queue } = setup({ fail: true });

    const first = queue.add(["101:a"]);
    const second = queue.add(["101:b"]);
    void queue.flush();

    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");
  });

  it("drops what waits on reset", async () => {
    const { queue, sent } = setup();

    const settled = queue.add(["101:a"]);
    queue.reset();

    await expect(settled).resolves.toBeUndefined();
    await queue.flush();
    expect(sent).toEqual([]);
  });

  it("flushes the shared queue upstream on pagehide", async () => {
    vi.stubEnv("VITE_API_MODE", "real");
    const seen: unknown[] = [];
    server.use(
      http.post("/api/entries/read", async ({ request }) => {
        seen.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const settled = markReadQueue.add(["101:a"]);
    window.dispatchEvent(new Event("pagehide"));
    await settled;

    expect(seen).toEqual([{ entryIds: ["101:a"] }]);
  });
});
