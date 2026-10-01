import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { advance } from "test/advanceTimers";
import { TooltipLayer } from "../TooltipLayer";
import { displayShortcut, shortcutList, tip } from "client/utils/tooltip";

const SHOW_DELAY_MS = 400;
const WARM_MS = 300;

const ui = {
  get tooltip() {
    return screen.getByRole("tooltip");
  },
  get hiddenTooltip() {
    return screen.getByRole("tooltip", { hidden: true });
  },
  button(name: string) {
    return screen.getByRole("button", { name });
  },
  link(name: string) {
    return screen.getByRole("link", { name });
  },
  textbox(name: string) {
    return screen.getByRole("textbox", { name });
  },
  text(content: string) {
    return screen.getByText(content);
  },
  pointer({
    type,
    target,
    pointerType = "mouse",
  }: {
    type: "pointerover" | "pointerout";
    target: Element;
    pointerType?: string;
  }) {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    fireEvent(target, event);
  },
  hover(target: Element) {
    this.pointer({ type: "pointerover", target });
  },
};

const Page = ({ Layer }: { Layer: typeof TooltipLayer }) => (
  <>
    <button type="button" {...tip({ label: "Unread only" })}>
      eye
    </button>
    <button type="button" {...tip({ label: "Open navigator", shortcut: "Meta+K" })}>
      search
    </button>
    <p data-tip="The Verge — All Posts" data-tip-overflow="">
      The Verge…
    </p>
    <input aria-label="Search" aria-keyshortcuts="/ Meta+K" data-tip="Search" />
    <a href="https://example.test" data-tip="A long headline" data-tip-overflow="Open the original">
      A long headline
    </a>
    <Layer />
  </>
);

const setup = ({ Layer = TooltipLayer }: { Layer?: typeof TooltipLayer } = {}) => {
  vi.useFakeTimers();
  render(<Page Layer={Layer} />);
};

describe("TooltipLayer", () => {
  it("opens after the delay on hover and closes when the pointer leaves", () => {
    setup();
    const trigger = ui.button("Unread only");
    ui.hover(trigger);
    advance(SHOW_DELAY_MS - 1);
    expect(ui.tooltip).not.toHaveAttribute("data-open");
    advance(1);
    expect(ui.tooltip).toHaveAttribute("data-open");
    expect(ui.tooltip).toHaveTextContent("Unread only");
    expect(ui.tooltip).toHaveAttribute("data-side", "bottom");

    ui.pointer({ type: "pointerout", target: trigger });
    expect(ui.tooltip).not.toHaveAttribute("data-open");
  });

  it("shows the shortcut as a key cap", () => {
    setup();
    ui.hover(ui.button("Open navigator"));
    advance(SHOW_DELAY_MS);
    expect(ui.tooltip.querySelector("kbd")).toHaveTextContent(displayShortcut("Meta+K"));
  });

  it("skips the delay when hopping to a neighbour right after closing", () => {
    setup();
    const first = ui.button("Unread only");
    const second = ui.button("Open navigator");
    ui.hover(first);
    advance(SHOW_DELAY_MS);
    ui.pointer({ type: "pointerout", target: first });
    advance(WARM_MS - 1);
    ui.hover(second);
    expect(ui.tooltip).toHaveTextContent("Open navigator");
  });

  it("waits the full delay again once the warm window has passed", () => {
    setup();
    const first = ui.button("Unread only");
    ui.hover(first);
    advance(SHOW_DELAY_MS);
    ui.pointer({ type: "pointerout", target: first });
    advance(WARM_MS);
    ui.hover(ui.button("Open navigator"));
    expect(ui.tooltip).not.toHaveAttribute("data-open");
    advance(SHOW_DELAY_MS);
    expect(ui.tooltip).toHaveAttribute("data-open");
  });

  it("does not restart the delay while moving inside the same trigger", () => {
    setup();
    const trigger = ui.button("Unread only");
    ui.hover(trigger);
    advance(SHOW_DELAY_MS / 2);
    ui.hover(trigger);
    advance(SHOW_DELAY_MS / 2);
    expect(ui.tooltip).toHaveAttribute("data-open");
  });

  it("never opens for a touch pointer", () => {
    setup();
    ui.pointer({
      type: "pointerover",
      target: ui.button("Unread only"),
      pointerType: "touch",
    });
    advance(SHOW_DELAY_MS);
    expect(ui.tooltip).not.toHaveAttribute("data-open");
  });

  it("opens at once on keyboard focus and closes on Escape", () => {
    setup();
    const trigger = ui.button("Unread only");
    act(() => {
      trigger.focus();
    });
    expect(ui.tooltip).toHaveAttribute("data-open");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(ui.tooltip).not.toHaveAttribute("data-open");
  });

  it("closes on pointer down, so a click never leaves it behind", () => {
    setup();
    const trigger = ui.button("Unread only");
    ui.hover(trigger);
    advance(SHOW_DELAY_MS);
    fireEvent.pointerDown(trigger);
    expect(ui.tooltip).not.toHaveAttribute("data-open");
  });

  it("shows an overflow tooltip only once the text is truncated", () => {
    setup();
    const text = ui.text("The Verge…");
    ui.hover(text);
    advance(SHOW_DELAY_MS);
    expect(ui.tooltip).not.toHaveAttribute("data-open");

    Object.defineProperty(text, "scrollWidth", { value: 300 });
    Object.defineProperty(text, "clientWidth", { value: 120 });
    ui.hover(text);
    advance(SHOW_DELAY_MS);
    expect(ui.tooltip).toHaveTextContent("The Verge — All Posts");
  });

  describe("when the popover API exists", () => {
    // jsdom has no popover API, and TooltipLayer reads its support once at load.
    it("shows the popover a frame after opening and survives the browser refusing it", async () => {
      const showPopover = vi.fn<() => void>(() => {
        throw new DOMException("A popover is hiding", "InvalidStateError");
      });
      Object.assign(HTMLElement.prototype, { showPopover, hidePopover: vi.fn<() => void>() });
      vi.resetModules();
      const { TooltipLayer: PopoverLayer } = await import("../TooltipLayer");
      setup({ Layer: PopoverLayer });
      ui.hover(ui.button("Unread only"));
      advance(SHOW_DELAY_MS);
      expect(showPopover).not.toHaveBeenCalled();
      advance(16);
      expect(showPopover).toHaveBeenCalledOnce();
      expect(ui.hiddenTooltip).toHaveAttribute("data-open");
    });
  });

  describe("when it has an overflow fallback", () => {
    it("names the action while the text fits, and the text once it is cut", () => {
      setup();
      const link = ui.link("A long headline");
      ui.hover(link);
      advance(SHOW_DELAY_MS);
      expect(ui.tooltip).toHaveTextContent("Open the original");
      ui.pointer({ type: "pointerout", target: link });

      Object.defineProperty(link, "scrollHeight", { value: 80 });
      Object.defineProperty(link, "clientHeight", { value: 40 });
      ui.hover(link);
      expect(ui.tooltip).toHaveTextContent("A long headline");
    });
  });

  describe("when on a field", () => {
    it("shows on hover with every alternative key cap, never on focus, and hides on typing", () => {
      setup();
      const field = ui.textbox("Search");
      act(() => {
        field.focus();
      });
      expect(ui.tooltip).not.toHaveAttribute("data-open");

      ui.hover(field);
      advance(SHOW_DELAY_MS);
      expect(ui.tooltip).toHaveAttribute("data-open");
      expect([...ui.tooltip.querySelectorAll("kbd")].map((kbd) => kbd.textContent)).toEqual([
        "/",
        displayShortcut("Meta+K"),
      ]);

      fireEvent.keyDown(field, { key: "a" });
      expect(ui.tooltip).not.toHaveAttribute("data-open");
    });
  });

  it("splits space-separated alternatives", () => {
    expect(shortcutList("/ Meta+K")).toEqual(["/", "Meta+K"]);
  });

  it("spells a chord for the current platform", () => {
    // jsdom's user agent names the OS as "darwin" or "linux", never "Mac", so this is the
    // Ctrl branch.
    expect(displayShortcut("Meta+K")).toBe("Ctrl+K");
    expect(displayShortcut("M")).toBe("M");
  });
});
