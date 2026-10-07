import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markQueue } from "client/api/markQueue";
import { applyUpdate, registerPwa } from "client/utils/pwaUpdate";

const originalFlush = markQueue.flush;

const setup = ({ waiting, controller }: { waiting: boolean; controller: boolean }) => {
  const updateSW = vi.fn<(reloadPage?: boolean) => Promise<void>>().mockResolvedValue(undefined);
  const reload = vi.fn<() => void>();
  vi.stubGlobal("location", { reload });
  vi.stubGlobal("navigator", {
    serviceWorker: {
      controller: controller ? {} : null,
      getRegistration: async () => {
        await Promise.resolve();
        return { waiting: waiting ? {} : null };
      },
    },
  });
  registerPwa({ register: () => updateSW });
  return { updateSW, reload };
};

describe("applyUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    markQueue.flush = originalFlush;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("when a worker is waiting and the page is controlled", () => {
    it("activates it and reloads after 3 seconds as a fallback", async () => {
      const { updateSW, reload } = setup({ waiting: true, controller: true });

      await applyUpdate();

      expect(updateSW).toHaveBeenCalledWith(true);
      expect(reload).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3000);
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  describe("when no worker is waiting", () => {
    it("reloads at once", async () => {
      const { updateSW, reload } = setup({ waiting: false, controller: true });

      await applyUpdate();

      expect(updateSW).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  describe("when the page has no controller", () => {
    it("reloads at once", async () => {
      const { updateSW, reload } = setup({ waiting: true, controller: false });

      await applyUpdate();

      expect(updateSW).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  describe("when the flush never settles", () => {
    it("gives up after 2 seconds and still updates", async () => {
      markQueue.flush = async () => new Promise<void>(() => {});
      const { updateSW } = setup({ waiting: true, controller: true });

      const done = applyUpdate();
      await vi.advanceTimersByTimeAsync(2000);
      await done;

      expect(updateSW).toHaveBeenCalledWith(true);
    });
  });

  describe("when the flush fails", () => {
    it("still updates", async () => {
      markQueue.flush = async () => {
        await Promise.resolve();
        throw new Error("offline");
      };
      const { updateSW } = setup({ waiting: true, controller: true });

      await applyUpdate();

      expect(updateSW).toHaveBeenCalledWith(true);
    });
  });
});
