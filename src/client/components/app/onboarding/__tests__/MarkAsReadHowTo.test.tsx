import { fireEvent, render as renderUi, screen, waitFor, within } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createContext, useContext } from "react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocalePreference } from "client/i18n/locale";
import { MarkAsReadHowTo } from "client/components/app/onboarding/MarkAsReadHowTo";

const tileOf = (sample: HTMLElement): HTMLElement => {
  const tile = sample.closest<HTMLElement>("[data-preview]");
  if (!tile) throw new Error("the sample is not a tile");
  return tile;
};

// The reader's header links to its feed and reads its stream param, so the dialog needs a matched
// route. The root route renders whatever the render helper passes in.
const SlotContext = createContext<ReactNode>(null);
const Slot = () => <>{useContext(SlotContext)}</>;
const rootRoute = createRootRoute({ component: Slot });
const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/stream/$streamKey" }),
  ]),
  history: createMemoryHistory({ initialEntries: ["/stream/all"] }),
});

const WithRouter = ({ children }: { children: ReactNode }) => (
  <SlotContext.Provider value={children}>
    <RouterProvider router={router} />
  </SlotContext.Provider>
);

const render = (ui: ReactElement) => renderUi(ui, { wrapper: WithRouter });

const ui = {
  get dialog() {
    return screen.getByRole("dialog", { name: "Mark stories as read" });
  },
  sample(title: string) {
    return within(this.dialog).getByRole("button", { name: new RegExp(title) });
  },
  mark(title: string) {
    return within(tileOf(this.sample(title))).getByRole("button", { name: /Mark as/ });
  },
  isRead(title: string) {
    return tileOf(this.sample(title)).hasAttribute("data-read");
  },
  get anyDialog() {
    return screen.getByRole("dialog");
  },
  button(name: string) {
    return within(this.dialog).getByRole("button", { name });
  },
  frenchSample(title: string) {
    return within(this.anyDialog).getByRole("button", { name: new RegExp(title) });
  },
  resetOrNull() {
    return within(this.dialog).queryByRole("button", { name: "Reset" });
  },
  get reset() {
    return within(this.dialog).getByRole("button", { name: "Reset" });
  },
  sampleOrNull(title: string) {
    return within(this.dialog).queryByRole("button", { name: new RegExp(title) });
  },
  panel(name: string) {
    return screen.queryByRole("tabpanel", { name });
  },
  panelWays(name: string) {
    return within(screen.getByRole("tabpanel", { name })).getAllByRole("listitem");
  },
  mouseLabel(tab: string, text: string) {
    return within(this.panelWays(tab)[1]).getByText(text);
  },
  tab(name: string) {
    return within(this.dialog).getByRole("tab", { name });
  },
  grid(title: string) {
    return this.sample(title).closest("[data-sample]")?.parentElement;
  },
  unreadToggles() {
    return within(this.dialog).queryAllByRole("button", { name: "Mark as unread", hidden: true });
  },
  focused() {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) throw new Error("nothing is focused");
    return el;
  },
};

const renderHowTo = () => {
  const onClose = vi.fn<() => void>();
  render(<MarkAsReadHowTo open onClose={onClose} returnFocusRef={{ current: null }} />);
  return { onClose };
};

const swipe = (sample: HTMLElement, dx: number) => {
  const tile = tileOf(sample);
  Object.defineProperty(tile, "setPointerCapture", { value: () => {}, configurable: true });
  fireEvent.pointerDown(sample, { pointerType: "touch", clientX: 10, clientY: 0, pointerId: 1 });
  fireEvent.pointerMove(sample, {
    pointerType: "touch",
    clientX: 10 + dx,
    clientY: 0,
    pointerId: 1,
  });
  fireEvent.pointerUp(sample, { pointerType: "touch", clientX: 10 + dx, clientY: 0, pointerId: 1 });
};

describe("MarkAsReadHowTo", () => {
  beforeAll(async () => {
    await router.load();
  });

  // The layout takes the dialog's content width, which jsdom does not measure (it falls back to 960).
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 408,
    });
    // jsdom has no PointerEvent, and a MouseEvent would drop pointerType and pointerId.
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        readonly pointerType: string;
        readonly pointerId: number;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerType = init.pointerType ?? "";
          this.pointerId = init.pointerId ?? 0;
        }
      },
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    vi.unstubAllGlobals();
  });

  it("marks a sample read from its check button, and it leaves the grid", async () => {
    setLocalePreference("en");
    renderHowTo();

    expect(ui.mark("Sample story one")).toHaveAccessibleName("Mark as read");
    fireEvent.click(ui.mark("Sample story one"));
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story one")).toBeNull();
    });
    expect(ui.sampleOrNull("Sample story two")).not.toBeNull();
  });

  it("does not mark a sample read on a click on its card body", () => {
    setLocalePreference("en");
    renderHowTo();

    fireEvent.click(ui.sample("Sample story one"));
    expect(ui.isRead("Sample story one")).toBe(false);
  });

  it("leaves the focused sample on M, and leaves modified M alone", async () => {
    setLocalePreference("en");
    renderHowTo();
    const sample = ui.sample("Sample story two");

    fireEvent.keyDown(sample, { key: "m", ctrlKey: true });
    expect(ui.isRead("Sample story two")).toBe(false);
    fireEvent.keyDown(sample, { key: "M" });
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story two")).toBeNull();
    });
  });

  it("leaves a sample on a touch swipe past 40% of its width, and a short swipe does nothing", async () => {
    setLocalePreference("en");
    renderHowTo();

    swipe(ui.sample("Sample story two"), 40);
    expect(ui.isRead("Sample story two")).toBe(false);

    swipe(ui.sample("Sample story three"), 200);
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story three")).toBeNull();
    });
  });

  it("does not bring back the card on the click that ends a committed swipe", async () => {
    setLocalePreference("en");
    renderHowTo();
    const sample = ui.sample("Sample story three");

    swipe(sample, 200);
    fireEvent.click(sample);
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story three")).toBeNull();
    });
  });

  it("shows Reset only once every card has left, and restores them on Reset", async () => {
    setLocalePreference("en");
    renderHowTo();
    expect(ui.resetOrNull()).toBeNull();

    fireEvent.click(ui.mark("Sample story one"));
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story one")).toBeNull();
    });
    fireEvent.click(ui.mark("Sample story two"));
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story two")).toBeNull();
    });
    expect(ui.resetOrNull()).toBeNull();
    fireEvent.click(ui.mark("Sample story three"));
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story three")).toBeNull();
    });

    await waitFor(() => {
      expect(ui.reset).toBeVisible();
    });
    fireEvent.click(ui.reset);

    expect(ui.isRead("Sample story one")).toBe(false);
    expect(ui.isRead("Sample story two")).toBe(false);
    expect(ui.isRead("Sample story three")).toBe(false);
    expect(ui.resetOrNull()).toBeNull();
  });

  it("moves focus to Reset when the last card is marked read by keyboard", async () => {
    setLocalePreference("en");
    renderHowTo();

    ui.sample("Sample story one").focus();
    fireEvent.keyDown(ui.focused(), { key: "M" });
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story one")).toBeNull();
    });
    expect(ui.sample("Sample story two")).toHaveFocus();

    fireEvent.keyDown(ui.focused(), { key: "M" });
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story two")).toBeNull();
    });
    expect(ui.sample("Sample story three")).toHaveFocus();

    fireEvent.keyDown(ui.focused(), { key: "M" });
    await waitFor(() => {
      expect(ui.reset).toHaveFocus();
    });
  });

  it("holds the Reset height while the last card leaves", () => {
    setLocalePreference("en");
    renderHowTo();
    const container = ui.grid("Sample story one");
    if (!container) throw new Error("the samples have no grid");
    for (const title of ["Sample story one", "Sample story two"]) {
      fireEvent.click(ui.mark(title));
    }
    fireEvent.click(ui.mark("Sample story three"));

    expect(container).toHaveStyle({ height: "44px" });
  });

  it("keeps the examples unread after a sample is read", async () => {
    setLocalePreference("en");
    renderHowTo();

    fireEvent.click(ui.mark("Sample story one"));
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story one")).toBeNull();
    });
    expect(ui.unreadToggles()).toHaveLength(0);
  });

  it("starts every opening with the samples unread", async () => {
    setLocalePreference("en");
    const returnFocusRef = { current: null };
    const { rerender } = render(
      <MarkAsReadHowTo open onClose={vi.fn<() => void>()} returnFocusRef={returnFocusRef} />,
    );
    fireEvent.click(ui.mark("Sample story one"));
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story one")).toBeNull();
    });

    rerender(
      <MarkAsReadHowTo
        open={false}
        onClose={vi.fn<() => void>()}
        returnFocusRef={returnFocusRef}
      />,
    );
    rerender(
      <MarkAsReadHowTo open onClose={vi.fn<() => void>()} returnFocusRef={returnFocusRef} />,
    );

    expect(ui.isRead("Sample story one")).toBe(false);
    expect(ui.resetOrNull()).toBeNull();
  });

  it("follows the locale for titles, and keeps the cards that left away", async () => {
    setLocalePreference("en");
    const returnFocusRef = { current: null };
    const { rerender } = render(
      <MarkAsReadHowTo open onClose={vi.fn<() => void>()} returnFocusRef={returnFocusRef} />,
    );
    fireEvent.click(ui.mark("Sample story one"));
    await waitFor(() => {
      expect(ui.sampleOrNull("Sample story one")).toBeNull();
    });

    setLocalePreference("fr");
    rerender(
      <MarkAsReadHowTo open onClose={vi.fn<() => void>()} returnFocusRef={returnFocusRef} />,
    );

    expect(ui.frenchSample("Exemple d’article deux")).toBeVisible();
  });

  it("closes from the X, once", () => {
    setLocalePreference("en");
    const { onClose } = renderHowTo();

    fireEvent.click(ui.button("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves between the tabs with Previous and Next, which disable at the ends", () => {
    setLocalePreference("en");
    renderHowTo();
    const previous = ui.button("Previous");
    const next = ui.button("Next");

    expect(previous).toBeDisabled();
    fireEvent.click(next);
    expect(ui.tab("Reader")).toHaveAttribute("aria-selected", "true");
    expect(ui.tab("Reader")).toHaveFocus();
    expect(next).toBeDisabled();
    expect(previous).toBeEnabled();

    fireEvent.click(previous);
    expect(ui.tab("Mosaic")).toHaveAttribute("aria-selected", "true");
  });

  it("makes the Reader panel focusable", () => {
    setLocalePreference("en");
    renderHowTo();
    fireEvent.click(ui.tab("Reader"));

    expect(ui.panel("Reader")).toHaveAttribute("tabindex", "0");
  });

  it("reports a dismissal once, and a programmatic close not at all", () => {
    setLocalePreference("en");
    const onClose = vi.fn<() => void>();
    const returnFocusRef = { current: null };
    const { rerender } = render(
      <MarkAsReadHowTo open onClose={onClose} returnFocusRef={returnFocusRef} />,
    );
    fireEvent(ui.anyDialog, new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<MarkAsReadHowTo open={false} onClose={onClose} returnFocusRef={returnFocusRef} />);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to its invoker once it closes", () => {
    setLocalePreference("en");
    const invoker = document.createElement("button");
    document.body.append(invoker);
    const returnFocusRef = { current: invoker };
    const { rerender } = render(
      <MarkAsReadHowTo open onClose={vi.fn<() => void>()} returnFocusRef={returnFocusRef} />,
    );

    rerender(
      <MarkAsReadHowTo
        open={false}
        onClose={vi.fn<() => void>()}
        returnFocusRef={returnFocusRef}
      />,
    );

    expect(invoker).toHaveFocus();
    invoker.remove();
  });

  it("gives the Mosaic ways the touch, mouse and keyboard order, each with its icon", () => {
    setLocalePreference("en");
    renderHowTo();

    const ways = ui.panelWays("Mosaic");
    expect(ways[0]).toHaveTextContent("Swipe a card sideways.");
    expect(ways[1]).toHaveTextContent("Click the check button on a card.");
    expect(ways[2]).toHaveTextContent("Focus a card, then press M");
    const icons = ways.map((item) => item.querySelector("use")?.getAttribute("href"));
    expect(icons.map((href) => href?.split("#").at(-1))).toEqual(["touch", "mouse", "keyboard"]);
  });

  it("names the check button and the reader button for a screen reader, not the icons", () => {
    setLocalePreference("en");
    renderHowTo();

    expect(ui.mouseLabel("Mosaic", "the check button").closest("[aria-hidden]")).toBeNull();
    fireEvent.click(ui.tab("Reader"));
    expect(ui.mouseLabel("Reader", "Mark as read and close").closest("[aria-hidden]")).toBeNull();
  });

  it("opens on the Mosaic tab, and the Reader tab explains the in-article case", () => {
    setLocalePreference("en");
    renderHowTo();

    expect(ui.tab("Mosaic")).toHaveAttribute("aria-selected", "true");
    fireEvent.click(ui.tab("Reader"));

    expect(ui.tab("Reader")).toHaveAttribute("aria-selected", "true");
    expect(ui.panel("Mosaic")).toBeNull();
    const ways = ui.panelWays("Reader");
    expect(ways[0]).toHaveTextContent("Pull up past the end of the article.");
    expect(ways[1]).toHaveTextContent("Click Mark as read and close in the header.");
    expect(ways[2]).toHaveTextContent("Press Esc");
  });

  it("moves between the tabs with the arrow keys, and focuses the one selected", () => {
    setLocalePreference("en");
    renderHowTo();

    fireEvent.keyDown(ui.tab("Mosaic"), { key: "ArrowRight" });
    expect(ui.tab("Reader")).toHaveAttribute("aria-selected", "true");
    expect(ui.tab("Reader")).toHaveFocus();

    fireEvent.keyDown(ui.tab("Reader"), { key: "ArrowLeft" });
    expect(ui.tab("Mosaic")).toHaveAttribute("aria-selected", "true");
    expect(ui.tab("Mosaic")).toHaveFocus();
  });

  it("reopens on the Mosaic tab", () => {
    setLocalePreference("en");
    const returnFocusRef = { current: null };
    const { rerender } = render(
      <MarkAsReadHowTo open onClose={vi.fn<() => void>()} returnFocusRef={returnFocusRef} />,
    );
    fireEvent.click(ui.tab("Reader"));

    rerender(
      <MarkAsReadHowTo
        open={false}
        onClose={vi.fn<() => void>()}
        returnFocusRef={returnFocusRef}
      />,
    );
    rerender(
      <MarkAsReadHowTo open onClose={vi.fn<() => void>()} returnFocusRef={returnFocusRef} />,
    );

    expect(ui.tab("Mosaic")).toHaveAttribute("aria-selected", "true");
  });
});
