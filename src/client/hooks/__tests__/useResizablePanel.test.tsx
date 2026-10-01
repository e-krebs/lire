import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STORAGE_KEY, useResizablePanel } from "../useResizablePanel";

const ui = {
  get handle() {
    return screen.getByRole("separator", { name: "Resize the article panel" });
  },
};

const Panel = () => {
  const { separatorProps } = useResizablePanel();
  return <div {...separatorProps} />;
};

const setViewport = (width: number): void => {
  window.innerWidth = width;
};

const setup = ({ stored, storage }: { stored?: string; storage?: Storage } = {}) => {
  setViewport(1024);
  if (storage)
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  if (stored !== undefined) window.localStorage.setItem(STORAGE_KEY, stored);
  render(<Panel />);
  const handle = ui.handle;
  // jsdom has no pointer capture; the hook only needs the three calls to exist.
  const captured = new Set<number>();
  handle.setPointerCapture = (id) => {
    captured.add(id);
  };
  handle.hasPointerCapture = (id) => captured.has(id);
  handle.releasePointerCapture = (id) => {
    captured.delete(id);
  };
  const width = () => Number(handle.getAttribute("aria-valuenow"));
  return { handle, width, captured };
};

describe("useResizablePanel", () => {
  it("starts at the default width, capped to leave the grid its share", () => {
    const { handle, width } = setup();

    expect(width()).toBe(640);
    expect(handle).toHaveAttribute("aria-valuemin", "384");
    expect(handle).toHaveAttribute("aria-valuemax", "704");
  });

  it("restores a stored width", () => {
    expect(setup({ stored: "500" }).width()).toBe(500);
  });

  it("falls back to the default when the stored value is not a number", () => {
    expect(setup({ stored: "wide" }).width()).toBe(640);
  });

  it("falls back to the default and still resizes when storage throws", () => {
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
    const { handle, width } = setup({ storage: throwingStorage });
    expect(width()).toBe(640);

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(width()).toBe(656);
  });

  it("steps with the arrows, jumps with Home and End, and stores the result", () => {
    const { handle, width } = setup();

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(width()).toBe(656);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(width()).toBe(624);
    fireEvent.keyDown(handle, { key: "Home" });
    expect(width()).toBe(384);
    fireEvent.keyDown(handle, { key: "End" });
    expect(width()).toBe(704);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("704");

    fireEvent.keyDown(handle, { key: "a" });
    expect(width()).toBe(704);
  });

  it("follows a primary-button drag leftwards and stores where it ends", () => {
    const { handle, width, captured } = setup();

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
    expect(handle).toHaveAttribute("data-dragging");
    expect(captured.has(1)).toBe(true);

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 360 });
    expect(width()).toBe(680);
    // Another pointer does not steer the drag.
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 0 });
    expect(width()).toBe(680);

    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 380 });
    expect(width()).toBe(660);
    expect(handle).not.toHaveAttribute("data-dragging");
    expect(captured.has(1)).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("660");

    // With the drag over, a stray move or end changes nothing.
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 0 });
    fireEvent.pointerCancel(handle, { pointerId: 1, clientX: 0 });
    expect(width()).toBe(660);
  });

  it("ignores a press with a button other than the primary one", () => {
    const { handle, width } = setup();

    fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300 });

    expect(handle).not.toHaveAttribute("data-dragging");
    expect(width()).toBe(640);
  });

  it("ends a cancelled drag even after the capture was lost", () => {
    const { handle, width, captured } = setup();

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 400 });
    captured.clear();
    fireEvent.pointerCancel(handle, { pointerId: 1, clientX: 420 });

    expect(width()).toBe(620);
    expect(handle).not.toHaveAttribute("data-dragging");
  });

  it("shrinks the panel and its cap when the viewport narrows", () => {
    const { handle, width } = setup();

    setViewport(800);
    fireEvent(window, new Event("resize"));

    expect(width()).toBe(480);
    expect(handle).toHaveAttribute("aria-valuemax", "480");
  });
});
