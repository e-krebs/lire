import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useOverlayOpen } from "client/hooks/useOverlay";
import type { ReactNode } from "react";
import { AddSourcesMenu } from "client/components/subscriptions/AddSourcesMenu";

const ui = {
  get trigger() {
    return screen.getByRole("button", { name: "＋ Add sources" });
  },
  get outside() {
    return screen.getByRole("button", { name: "Outside" });
  },
  get group() {
    return this.item("Add website").parentElement!;
  },
  item(name: string) {
    return screen.getByRole("button", { name, hidden: true });
  },
  get outsideInert() {
    return this.outside.closest("[inert]") !== null;
  },
  get dialog() {
    return document.querySelector("dialog");
  },
  toggle(newState: "open" | "closed") {
    const event = new Event("toggle");
    Object.defineProperty(event, "newState", { value: newState });
    fireEvent(this.group, event);
  },
};

const setup = ({ inDialog = false }: { inDialog?: boolean } = {}) => {
  // jsdom has no popover API.
  const hidePopover = vi.fn<() => void>();
  HTMLElement.prototype.hidePopover = hidePopover;
  const onAddWebsite = vi.fn<() => void>();
  const onAddNewsletter = vi.fn<() => void>();
  const onOutsideClick = vi.fn<() => void>();
  const onAncestorKeyDown = vi.fn<() => void>();
  const menu = (
    <AddSourcesMenu
      onAddWebsite={onAddWebsite}
      onAddNewsletter={onAddNewsletter}
      // oxlint-disable-next-line tailwindcss/no-unknown-classes
      className="trigger"
    />
  );
  render(
    <div role="presentation" onKeyDown={onAncestorKeyDown}>
      <Shell>
        {inDialog ? <dialog open>{menu}</dialog> : menu}
        <button type="button" onClick={onOutsideClick}>
          Outside
        </button>
      </Shell>
    </div>,
  );
  return {
    user: userEvent.setup(),
    hidePopover,
    onAddWebsite,
    onAddNewsletter,
    onOutsideClick,
    onAncestorKeyDown,
  };
};

// Stands in for AppShell, which makes <main> inert while an overlay is open.
const Shell = ({ children }: { children: ReactNode }) => (
  <main inert={useOverlayOpen() || undefined}>{children}</main>
);

describe("AddSourcesMenu", () => {
  describe("when an item is picked", () => {
    it("closes the menu and calls its callback", async () => {
      const { user, hidePopover, onAddWebsite, onAddNewsletter } = setup();

      await user.click(ui.item("Add website"));
      await user.click(ui.item("Add newsletter"));

      expect(onAddWebsite).toHaveBeenCalledOnce();
      expect(onAddNewsletter).toHaveBeenCalledOnce();
      expect(hidePopover).toHaveBeenCalledTimes(2);
    });
  });

  describe("when the menu opens", () => {
    it("flags the trigger as expanded, then collapsed on close", () => {
      setup();
      expect(ui.trigger).toHaveAttribute("aria-expanded", "false");

      ui.toggle("open");
      expect(ui.trigger).toHaveAttribute("aria-expanded", "true");

      ui.toggle("closed");
      expect(ui.trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("makes the page below inert, and lets it back on close", () => {
      setup();
      expect(ui.outsideInert).toBe(false);

      ui.toggle("open");
      expect(ui.outsideInert).toBe(true);

      ui.toggle("closed");
      expect(ui.outsideInert).toBe(false);
    });

    it("keeps the menu itself live", async () => {
      const { user, onAddWebsite } = setup();
      ui.toggle("open");

      expect(ui.group.closest("[inert]")).toBeNull();
      await user.click(ui.item("Add website"));
      expect(onAddWebsite).toHaveBeenCalledOnce();
    });

    it("swallows the click that follows a press outside", async () => {
      const { user, onOutsideClick } = setup();
      ui.toggle("open");

      await user.click(ui.outside);
      expect(onOutsideClick).not.toHaveBeenCalled();

      ui.toggle("closed");
      await user.click(ui.outside);
      expect(onOutsideClick).toHaveBeenCalledOnce();
    });

    it("lets presses on the trigger and inside the menu through", async () => {
      const { user, onAddWebsite, onOutsideClick } = setup();
      ui.toggle("open");

      await user.click(ui.trigger);
      await user.click(ui.item("Add website"));
      await user.click(ui.outside);

      expect(onAddWebsite).toHaveBeenCalledOnce();
      expect(onOutsideClick).not.toHaveBeenCalled();
    });
  });

  describe("when it sits in a modal dialog", () => {
    it("portals the menu into that dialog", () => {
      setup({ inDialog: true });

      expect(ui.group.parentElement).toBe(ui.dialog);
    });
  });

  describe("when it sits outside any dialog", () => {
    it("portals the menu into the body", () => {
      setup();

      expect(ui.group.parentElement).toBe(document.body);
    });
  });

  describe("when Escape is pressed in the menu", () => {
    it("stops the key before it reaches a React ancestor, without preventing it", () => {
      const { onAncestorKeyDown } = setup();
      ui.toggle("open");

      const notPrevented = fireEvent.keyDown(ui.item("Add website"), { key: "Escape" });

      expect(notPrevented).toBe(true);
      expect(onAncestorKeyDown).not.toHaveBeenCalled();
    });

    it("stops it from the trigger too while the menu is open", () => {
      const { onAncestorKeyDown } = setup();

      fireEvent.keyDown(ui.trigger, { key: "Escape" });
      expect(onAncestorKeyDown).toHaveBeenCalledOnce();

      ui.toggle("open");
      fireEvent.keyDown(ui.trigger, { key: "Escape" });
      expect(onAncestorKeyDown).toHaveBeenCalledOnce();
    });

    it("lets other keys through", () => {
      const { onAncestorKeyDown } = setup();
      ui.toggle("open");

      fireEvent.keyDown(ui.item("Add website"), { key: "a" });

      expect(onAncestorKeyDown).toHaveBeenCalledOnce();
    });
  });

  describe("when the menu is dismissed", () => {
    it("focuses the trigger once the page is live again, if focus was lost to the body", () => {
      setup();
      ui.toggle("open");
      ui.outside.focus();
      ui.outside.blur();

      ui.toggle("closed");

      expect(ui.trigger).toHaveFocus();
    });

    it("focuses the trigger if focus was inside the menu", () => {
      setup();
      ui.toggle("open");
      ui.item("Add website").focus();

      ui.toggle("closed");

      expect(ui.trigger).toHaveFocus();
    });

    it("leaves focus alone when it moved elsewhere", () => {
      setup();
      ui.toggle("open");
      ui.outside.focus();

      ui.toggle("closed");

      expect(ui.outside).toHaveFocus();
    });

    it("does not refocus the trigger after an item was picked", async () => {
      const { user } = setup();
      ui.toggle("open");
      await user.click(ui.item("Add website"));
      ui.item("Add website").blur();

      ui.toggle("closed");

      expect(ui.trigger).not.toHaveFocus();
    });
  });
});
