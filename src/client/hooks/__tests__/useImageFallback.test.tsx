import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useImageFallback } from "../useImageFallback";

const setup = (initial: { url?: string; fallbackUrl?: string }) =>
  renderHook((props: { url?: string; fallbackUrl?: string }) => useImageFallback(props), {
    initialProps: initial,
  });

describe("useImageFallback", () => {
  it("starts on the url", () => {
    const { result } = setup({ url: "a.png", fallbackUrl: "b.png" });
    expect(result.current.src).toBe("a.png");
  });

  it("switches to the fallback after one error", () => {
    const { result } = setup({ url: "a.png", fallbackUrl: "b.png" });
    act(() => {
      result.current.onError();
    });
    expect(result.current.src).toBe("b.png");
  });

  it("gives up after two errors", () => {
    const { result } = setup({ url: "a.png", fallbackUrl: "b.png" });
    act(() => {
      result.current.onError();
    });
    act(() => {
      result.current.onError();
    });
    expect(result.current.src).toBeUndefined();
  });

  it("gives up on the first error without a fallback", () => {
    const { result } = setup({ url: "a.png" });
    act(() => {
      result.current.onError();
    });
    expect(result.current.src).toBeUndefined();
  });

  it("skips a fallback equal to the url", () => {
    const { result } = setup({ url: "a.png", fallbackUrl: "a.png" });
    act(() => {
      result.current.onError();
    });
    expect(result.current.src).toBeUndefined();
  });

  it("resets when the url changes", () => {
    const { result, rerender } = setup({ url: "a.png", fallbackUrl: "b.png" });
    act(() => {
      result.current.onError();
    });
    act(() => {
      result.current.onError();
    });
    rerender({ url: "c.png", fallbackUrl: "b.png" });
    expect(result.current.src).toBe("c.png");
  });

  it("resets when the fallback url changes", () => {
    const { result, rerender } = setup({ url: "a.png", fallbackUrl: "b.png" });
    act(() => {
      result.current.onError();
    });
    rerender({ url: "a.png", fallbackUrl: "d.png" });
    expect(result.current.src).toBe("a.png");
  });
});
