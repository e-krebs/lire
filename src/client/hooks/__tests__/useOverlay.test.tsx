import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useActiveOverlay, useOverlay, useOverlayOpen } from "../useOverlay";

describe("overlay", () => {
  it("reports open while any registered surface is open, and clear once all closed", () => {
    const shell = renderHook(() => useOverlayOpen());
    expect(shell.result.current).toBe(false);

    const menu = renderHook(
      ({ open }: { open: boolean }) => {
        useOverlay({ id: "menu", isOpen: open });
      },
      { initialProps: { open: true } },
    );
    const popover = renderHook(
      ({ open }: { open: boolean }) => {
        useOverlay({ id: "popover", isOpen: open });
      },
      { initialProps: { open: true } },
    );
    expect(shell.result.current).toBe(true);

    act(() => {
      menu.rerender({ open: false });
    });
    expect(shell.result.current).toBe(true);

    act(() => {
      popover.unmount();
    });
    expect(shell.result.current).toBe(false);
  });

  it("names the most recently opened surface as the active one", () => {
    const active = renderHook(() => useActiveOverlay());
    expect(active.result.current).toBeNull();

    const menu = renderHook(() => {
      useOverlay({ id: "menu", isOpen: true });
    });
    expect(active.result.current).toBe("menu");

    const popover = renderHook(() => {
      useOverlay({ id: "popover", isOpen: true });
    });
    expect(active.result.current).toBe("popover");

    act(() => {
      popover.unmount();
    });
    expect(active.result.current).toBe("menu");

    act(() => {
      menu.unmount();
    });
    expect(active.result.current).toBeNull();
  });
});
