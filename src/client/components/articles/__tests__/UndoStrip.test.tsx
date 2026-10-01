import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UNDO_STRIP_HEIGHT, UndoStrip } from "../UndoStrip";

const ui = {
  async strip() {
    const status = await screen.findByRole("status");
    const strip = status.closest<HTMLElement>(".undo-strip");
    if (!strip) throw new Error("no undo strip");
    return strip;
  },
  get undo() {
    return screen.findByRole("button", { name: "Undo" });
  },
  get confirm() {
    return screen.findByRole("button", { name: "Confirm" });
  },
};

const setup = ({ leaving, autoFocus }: { leaving?: boolean; autoFocus?: boolean } = {}) => {
  const onUndo = vi.fn<() => void>();
  const onConfirm = vi.fn<() => void>();
  render(
    <UndoStrip
      slot={{ x: 24, y: 48, width: 360 }}
      leaving={leaving}
      autoFocus={autoFocus}
      onUndo={onUndo}
      onConfirm={onConfirm}
    />,
  );
  return { onUndo, onConfirm };
};

describe("UndoStrip", () => {
  it("sits in the slot the grid gave it, at the strip's own height", async () => {
    setup();
    expect(await ui.strip()).toHaveStyle({
      translate: "24px 48px",
      width: "360px",
      height: `${UNDO_STRIP_HEIGHT}px`,
    });
  });

  it("says what happened, without naming the article", async () => {
    setup();
    expect(await ui.strip()).toHaveTextContent("Marked as read");
  });

  it("marks the entry unread again from Undo", async () => {
    const user = userEvent.setup();
    const { onUndo, onConfirm } = setup();
    await user.click(await ui.undo);
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes the strip early from Confirm", async () => {
    const user = userEvent.setup();
    const { onUndo, onConfirm } = setup();
    await user.click(await ui.confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onUndo).not.toHaveBeenCalled();
  });

  // The countdown animation is the only timer, so its end is what commits the read.
  it("keeps the entry read once the countdown animation ends", async () => {
    const { onConfirm } = setup();
    (await ui.strip()).dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("ignores an animation ending on one of its buttons", async () => {
    const { onConfirm } = setup();
    (await ui.undo).dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("carries a data attribute while leaving", async () => {
    setup({ leaving: true });
    expect(await ui.strip()).toHaveAttribute("data-leaving");
  });

  it("goes inert while leaving, so its faded buttons hold no focus", async () => {
    setup({ leaving: true });
    expect(await ui.strip()).toHaveAttribute("inert");
  });

  it("focuses Undo on mount when asked", async () => {
    setup({ autoFocus: true });
    expect(await ui.undo).toHaveFocus();
  });

  it("tells the grid whether focus was inside when Undo runs", async () => {
    const user = userEvent.setup();
    const { onUndo } = setup();
    await user.click(await ui.undo);
    expect(onUndo).toHaveBeenCalledWith({ hadFocus: true });
  });
});
