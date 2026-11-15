import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLeavingTiles } from "../useLeavingTiles";

const slot = { x: 0, y: 0, width: 100, height: 100 };
const slots = (id: string) => new Map([[id, slot]]);
const ids = (...values: string[]) => new Set(values);

describe("useLeavingTiles", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("moves leaving tiles to gone after 200 ms", () => {
    const { result } = renderHook(useLeavingTiles);
    act(() => {
      result.current.leave({ slots: slots("a") });
    });
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current.leaving.has("a")).toBe(true);
    expect(result.current.gone.has("a")).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.leaving.size).toBe(0);
    expect(result.current.gone).toEqual(ids("a"));
  });

  it("restarts the timer when another tile leaves", () => {
    const { result } = renderHook(useLeavingTiles);
    act(() => {
      result.current.leave({ slots: slots("a") });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      result.current.leave({ slots: slots("b") });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.gone.size).toBe(0);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.gone).toEqual(ids("a", "b"));
  });

  it("revives tiles from both states", () => {
    const { result } = renderHook(useLeavingTiles);
    act(() => {
      result.current.leave({ slots: slots("a") });
      result.current.remove({ ids: ids("b") });
    });
    act(() => {
      result.current.revive({ ids: ids("a", "b") });
    });
    expect(result.current.leaving.size).toBe(0);
    expect(result.current.gone.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resets both states", () => {
    const { result } = renderHook(useLeavingTiles);
    act(() => {
      result.current.leave({ slots: slots("a") });
      result.current.remove({ ids: ids("b") });
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.leaving.size).toBe(0);
    expect(result.current.gone.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes tiles without a timer", () => {
    const { result } = renderHook(useLeavingTiles);
    act(() => {
      result.current.remove({ ids: ids("a") });
    });
    expect(result.current.gone).toEqual(ids("a"));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applies batched leave, revive and remove actions", () => {
    const { result } = renderHook(useLeavingTiles);
    act(() => {
      result.current.leave({ slots: slots("a") });
      result.current.leave({ slots: slots("b") });
      result.current.revive({ ids: ids("a") });
      result.current.remove({ ids: ids("c") });
    });
    expect(result.current.leaving).toEqual(slots("b"));
    expect(result.current.gone).toEqual(ids("c"));
  });
});
