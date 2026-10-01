import { renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { setBarPosition } from "client/hooks/utils/barPosition";
import { useBarPosition } from "../useBarPosition";

const STORAGE_KEY = "lire.barPosition";

// The store reads localStorage once, at import: a stored value only reaches it through a
// fresh module instance.
const freshStore = async () => {
  vi.resetModules();
  return import("../useBarPosition");
};

// Module state outlives a test; setting it saves, so the clear comes after.
const setup = (): void => {
  setBarPosition("top");
  window.localStorage.clear();
  delete document.documentElement.dataset.bar;
};

describe("useBarPosition", () => {
  it("starts at the top", () => {
    setup();
    const { result } = renderHook(() => useBarPosition());
    expect(result.current).toBe("top");
    expect(document.documentElement.dataset.bar).toBeUndefined();
  });

  it("renders at the top on the server", () => {
    setup();
    setBarPosition("bottom");
    const Probe = () => createElement("p", null, useBarPosition());

    expect(renderToString(createElement(Probe))).toContain("top");
    setBarPosition("top");
  });

  it("moves the bar to the bottom and back", () => {
    setup();
    const { result } = renderHook(() => useBarPosition());

    act(() => {
      setBarPosition("bottom");
    });
    expect(result.current).toBe("bottom");
    expect(document.documentElement.dataset.bar).toBe("bottom");

    act(() => {
      setBarPosition("top");
    });
    expect(result.current).toBe("top");
    expect(document.documentElement.dataset.bar).toBeUndefined();
  });

  it("persists the choice", () => {
    setup();
    setBarPosition("bottom");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("bottom");
  });

  it("reads the stored choice back on a later visit", async () => {
    setup();
    window.localStorage.setItem(STORAGE_KEY, "bottom");
    const store = await freshStore();

    expect(renderHook(() => store.useBarPosition()).result.current).toBe("bottom");
    expect(document.documentElement.dataset.bar).toBe("bottom");
  });

  it("falls back to the top for a value it does not know", async () => {
    setup();
    window.localStorage.setItem(STORAGE_KEY, "sideways");
    const store = await freshStore();

    expect(renderHook(() => store.useBarPosition()).result.current).toBe("top");
  });

  it("holds the choice for the session when storage is blocked", () => {
    setup();
    const throwingStorage: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => {
        throw new Error("blocked");
      },
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new Error("blocked");
      },
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: throwingStorage });
    const { result } = renderHook(() => useBarPosition());

    expect(() => {
      act(() => {
        setBarPosition("bottom");
      });
    }).not.toThrow();
    expect(result.current).toBe("bottom");
  });

  it("notifies every subscriber of a change", () => {
    setup();
    const first = renderHook(() => useBarPosition());
    const second = renderHook(() => useBarPosition());

    act(() => {
      setBarPosition("bottom");
    });

    expect(first.result.current).toBe("bottom");
    expect(second.result.current).toBe("bottom");
  });
});
