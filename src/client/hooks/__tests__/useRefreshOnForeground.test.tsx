import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRefreshOnForeground } from "../useRefreshOnForeground";

const setVisibility = (state: "hidden" | "visible") => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("useRefreshOnForeground", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("refreshes after more than 60 s hidden", () => {
    const onForeground = vi.fn<() => Promise<void>>().mockResolvedValue();
    renderHook(() => {
      useRefreshOnForeground({ onForeground });
    });

    setVisibility("hidden");
    vi.advanceTimersByTime(61_000);
    setVisibility("visible");

    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it("stays quiet after a short absence", () => {
    const onForeground = vi.fn<() => Promise<void>>().mockResolvedValue();
    renderHook(() => {
      useRefreshOnForeground({ onForeground });
    });

    setVisibility("hidden");
    vi.advanceTimersByTime(30_000);
    setVisibility("visible");

    expect(onForeground).not.toHaveBeenCalled();
  });

  it("stays quiet at exactly 60 s and refreshes just past it", () => {
    const onForeground = vi.fn<() => Promise<void>>().mockResolvedValue();
    renderHook(() => {
      useRefreshOnForeground({ onForeground });
    });

    setVisibility("hidden");
    vi.advanceTimersByTime(60_000);
    setVisibility("visible");
    expect(onForeground).not.toHaveBeenCalled();

    setVisibility("hidden");
    vi.advanceTimersByTime(60_001);
    setVisibility("visible");
    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it("removes the listener on unmount", () => {
    const onForeground = vi.fn<() => Promise<void>>().mockResolvedValue();
    const { unmount } = renderHook(() => {
      useRefreshOnForeground({ onForeground });
    });
    unmount();

    setVisibility("hidden");
    vi.advanceTimersByTime(61_000);
    setVisibility("visible");

    expect(onForeground).not.toHaveBeenCalled();
  });

  it("refreshes again on a second cycle once the first refresh is done", async () => {
    const onForeground = vi.fn<() => Promise<void>>().mockResolvedValue();
    renderHook(() => {
      useRefreshOnForeground({ onForeground });
    });

    for (let cycle = 0; cycle < 2; cycle++) {
      setVisibility("hidden");
      vi.advanceTimersByTime(61_000);
      setVisibility("visible");
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(onForeground).toHaveBeenCalledTimes(2);
  });

  it("skips a new refresh while the previous one is running", () => {
    const onForeground = vi.fn<() => Promise<void>>().mockReturnValue(new Promise<void>(() => {}));
    renderHook(() => {
      useRefreshOnForeground({ onForeground });
    });

    for (let cycle = 0; cycle < 2; cycle++) {
      setVisibility("hidden");
      vi.advanceTimersByTime(61_000);
      setVisibility("visible");
    }

    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejecting onForeground and allows the next refresh", async () => {
    const onForeground = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue();
    renderHook(() => {
      useRefreshOnForeground({ onForeground });
    });

    for (let cycle = 0; cycle < 2; cycle++) {
      setVisibility("hidden");
      vi.advanceTimersByTime(61_000);
      setVisibility("visible");
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(onForeground).toHaveBeenCalledTimes(2);
  });
});
