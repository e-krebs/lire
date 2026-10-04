import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useColorScheme } from "../useColorScheme";

const stubMatchMedia = (matches: boolean) => {
  let listener: (() => void) | undefined;
  const query = {
    matches,
    addEventListener: (_: string, fn: () => void) => {
      listener = fn;
    },
    removeEventListener: vi.fn<() => void>(),
  };
  vi.stubGlobal("matchMedia", () => query);
  return {
    flip: () => {
      query.matches = !query.matches;
      listener?.();
    },
  };
};

describe("useColorScheme", () => {
  it("reads light when matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(() => useColorScheme()).result.current).toBe("light");
  });

  it("reads dark and follows a scheme change", () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe("dark");
    act(() => {
      media.flip();
    });
    expect(result.current).toBe("light");
  });
});
