import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHoldWhileCovered } from "../useHoldWhileCovered";

describe("useHoldWhileCovered", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holds while covered and for 300 ms after uncovering", () => {
    const passes: boolean[] = [];
    const { result, rerender } = renderHook(
      ({ covered }) => {
        const hold = useHoldWhileCovered({ covered });
        passes.push(hold);
        return hold;
      },
      { initialProps: { covered: false } },
    );
    expect(result.current).toBe(false);
    rerender({ covered: true });
    expect(result.current).toBe(true);
    passes.length = 0;
    rerender({ covered: false });
    expect(passes[0]).toBe(true);
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });
});
