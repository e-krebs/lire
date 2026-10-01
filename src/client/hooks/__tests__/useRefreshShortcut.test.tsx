import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRefreshShortcut } from "../useRefreshShortcut";

const ui = {
  get textbox() {
    return screen.getByRole("textbox");
  },
  get menuButton() {
    return screen.getByRole("button", { name: "Menu" });
  },
  get articleButton() {
    return screen.getByRole("button", { name: "Article" });
  },
};

const setup = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const onRefresh = vi.fn<() => void>();
  renderHook(() => {
    useRefreshShortcut({ enabled, onRefresh });
  });
  return { onRefresh };
};

describe("useRefreshShortcut", () => {
  it("fires on a bare r", () => {
    const { onRefresh } = setup();

    fireEvent.keyDown(document.body, { key: "r" });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while disabled", () => {
    const { onRefresh } = setup({ enabled: false });

    fireEvent.keyDown(document.body, { key: "r" });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("leaves r to the field being typed in", () => {
    const { onRefresh } = setup();
    render(
      <main>
        <input aria-label="Search" />
      </main>,
    );

    fireEvent.keyDown(ui.textbox, { key: "r" });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("ignores the browser's own Meta+r", () => {
    const { onRefresh } = setup();

    fireEvent.keyDown(document.body, { key: "r", metaKey: true });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("ignores Shift+R", () => {
    const { onRefresh } = setup();

    fireEvent.keyDown(document.body, { key: "R" });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("stays quiet while the header holds focus", () => {
    const { onRefresh } = setup();
    render(
      <header>
        <button type="button">Menu</button>
      </header>,
    );

    fireEvent.keyDown(ui.menuButton, { key: "r" });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("fires from a control inside the results", () => {
    const { onRefresh } = setup();
    render(
      <main>
        <button type="button">Article</button>
      </main>,
    );

    fireEvent.keyDown(ui.articleButton, { key: "r" });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
