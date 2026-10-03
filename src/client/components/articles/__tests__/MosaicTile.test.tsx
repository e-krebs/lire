import { act, fireEvent, render } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { KeyboardEvent } from "react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { directOpenKey } from "shared/feedsApi/preferences";
import type { Entry } from "shared/feedsApi/types";
import { keys } from "client/api/queries";
import { MosaicTile, type TileSlot } from "../MosaicTile";

const ORIGINAL = "https://example.test/posts/a-test-entry";

const makeEntry = (overrides: Partial<Entry> = {}): Entry => ({
  id: "101:entry1",
  feedId: "101",
  title: "A test entry",
  published: Date.now(),
  unread: true,
  url: ORIGINAL,
  ...overrides,
});

const SLOT: TileSlot = { x: 0, y: 0, width: 300, height: 375 };

const newQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const setup = ({
  entry,
  slot = SLOT,
  swipeable,
  leavesWhenRead,
  client = newQueryClient(),
}: {
  entry: Entry;
  slot?: TileSlot;
  swipeable?: boolean;
  leavesWhenRead?: boolean;
  client?: QueryClient;
}) => {
  client.setQueryData(keys.feeds, [
    { id: "101", title: "Example Feed", categoryIds: [], isNewsletter: false },
  ]);
  const onToggleRead = vi.fn<() => void>();
  const onKeyDown = vi.fn<(event: KeyboardEvent<HTMLAnchorElement>) => void>();
  // The tile sits on the root route, so it stays mounted when its own link navigates away, as a
  // card in the results grid does on desktop.
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <MosaicTile
          streamKey="all"
          entry={entry}
          slot={slot}
          tabIndex={0}
          onFocus={() => {}}
          onKeyDown={onKeyDown}
          onToggleRead={onToggleRead}
          swipeable={swipeable}
          leavesWhenRead={leavesWhenRead}
        />
        <Outlet />
      </>
    ),
  });
  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([testRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const title = entry.title ?? "";
  // The card link carries the bare title; the title link adds what it does to its name.
  const ui = {
    async link() {
      return view.findByRole("link", { name: title });
    },
    async titleLink() {
      return view.findByRole("link", { name: `${title} (opens the original in a new tab)` });
    },
    async titleText() {
      return view.findByText(title);
    },
    // The link sits in the mover, which sits in the slot-sized wrapper.
    async wrapper() {
      const wrapper = (await this.link()).closest<HTMLElement>("[data-entry-id]");
      if (!wrapper) throw new Error("the card link sits outside a tile wrapper");
      return wrapper;
    },
    async mover() {
      return (await this.link()).parentElement;
    },
    async action() {
      return (await this.link())
        .closest("[data-entry-id]")
        ?.querySelector<HTMLElement>(".tile-action");
    },
    async indicator() {
      return (await this.link()).closest("[data-entry-id]")?.querySelector("[data-side]");
    },
    async reveal() {
      return (await this.link())
        .closest("[data-entry-id]")
        ?.querySelector<HTMLElement>(".tile-action")
        ?.style.getPropertyValue("--reveal");
    },
    async toggle() {
      return view.findByRole("button");
    },
    async age() {
      return (await this.link()).parentElement?.querySelector("time");
    },
    async chip() {
      return (await this.link()).parentElement?.querySelector(".bg-accent svg");
    },
  };

  return { router, onToggleRead, onKeyDown, ui };
};

describe("MosaicTile", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders an image tile for an entry with an image", async () => {
    const { ui } = setup({ entry: makeEntry({ imageUrl: "https://example.test/photo.jpg" }) });
    const wrapper = await ui.wrapper();
    expect(wrapper).toHaveAttribute("data-has-image");
    expect(wrapper.querySelector("img")).toHaveAttribute("src", "https://example.test/photo.jpg");
    expect(await ui.titleText()).toBeInTheDocument();
  });

  it("drops the image when it fails to load", async () => {
    const { ui } = setup({ entry: makeEntry({ imageUrl: "https://example.test/photo.jpg" }) });
    const wrapper = await ui.wrapper();
    fireEvent.error(wrapper.querySelector("img")!);
    expect(wrapper.querySelector("img")).toBeNull();
    expect(wrapper).not.toHaveAttribute("data-has-image");
  });

  it("renders a text tile when the entry has no image", async () => {
    const { ui } = setup({ entry: makeEntry() });
    const wrapper = await ui.wrapper();
    expect(wrapper).not.toHaveAttribute("data-has-image");
    expect(wrapper.querySelector("img")).toBeNull();
    expect(await ui.titleText()).toBeInTheDocument();
  });

  it("marks a read entry with a data attribute", async () => {
    const { ui } = setup({ entry: makeEntry({ unread: false }) });
    expect(await ui.wrapper()).toHaveAttribute("data-read");
  });

  it("omits the data attribute for an unread entry", async () => {
    const { ui } = setup({ entry: makeEntry({ unread: true }) });
    expect(await ui.wrapper()).not.toHaveAttribute("data-read");
  });

  it("tags the wrapper with the entry id for the grid to focus", async () => {
    const { ui } = setup({ entry: makeEntry() });
    expect(await ui.wrapper()).toHaveAttribute("data-entry-id", "101:entry1");
  });

  it("places itself at the slot the grid gave it", async () => {
    const { ui } = setup({ entry: makeEntry(), slot: { ...SLOT, x: 10, y: 20 } });
    expect((await ui.wrapper()).style.translate).toBe("10px 20px");
  });

  it("shows the feed title and the entry age in the masthead", async () => {
    const published = Date.now() - (3 * 60 * 60 * 1000 + 60 * 1000);
    const { ui } = setup({ entry: makeEntry({ published }) });
    expect(await ui.wrapper()).toHaveTextContent("Example Feed");
    const age = await ui.age();
    expect(age).toHaveTextContent("3h");
    expect(age).toHaveAttribute("datetime", new Date(published).toISOString());
  });

  it('labels the toggle "Mark as read" for an unread entry', async () => {
    const { ui } = setup({ entry: makeEntry({ unread: true }) });
    expect(await ui.toggle()).toHaveAttribute("aria-label", "Mark as read");
  });

  it('labels the toggle "Mark as unread" for a read entry', async () => {
    const { ui } = setup({ entry: makeEntry({ unread: false }) });
    expect(await ui.toggle()).toHaveAttribute("aria-label", "Mark as unread");
  });

  it("toggles the read state from the button without navigating", async () => {
    const user = userEvent.setup();
    const { ui, router, onToggleRead } = setup({ entry: makeEntry() });
    await user.click(await ui.toggle());
    expect(onToggleRead).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe("/");
  });

  it("toggles the read state when m is pressed on the tile", async () => {
    const user = userEvent.setup();
    const { ui, onToggleRead, onKeyDown } = setup({ entry: makeEntry() });
    (await ui.link()).focus();
    await user.keyboard("m");
    expect(onToggleRead).toHaveBeenCalledTimes(1);
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("forwards any other key to the grid", async () => {
    const user = userEvent.setup();
    const { ui, onToggleRead, onKeyDown } = setup({ entry: makeEntry() });
    (await ui.link()).focus();
    await user.keyboard("{ArrowDown}");
    expect(onToggleRead).not.toHaveBeenCalled();
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown.mock.calls[0]?.[0]).toMatchObject({ key: "ArrowDown" });
  });

  describe("when the title has a link to the original", () => {
    it("points the title at the original in a new tab", async () => {
      const { ui } = setup({ entry: makeEntry() });
      const titleLink = await ui.titleLink();
      expect(titleLink).toHaveAttribute("href", ORIGINAL);
      expect(titleLink).toHaveAttribute("target", "_blank");
      expect(titleLink).toHaveAttribute("rel", "noopener");
      expect(titleLink).toHaveAttribute("data-tip-overflow", "Open the original");
    });

    it("keeps the card routing to the reader", async () => {
      const { ui } = setup({ entry: makeEntry() });
      expect(await ui.link()).toHaveAttribute("href", "/stream/all/entry/101%3Aentry1");
    });

    it("leaves the title a plain span for a newsletter with no original", async () => {
      const { ui } = setup({ entry: makeEntry({ url: undefined }) });
      const titleText = await ui.titleText();
      expect(titleText.tagName).toBe("SPAN");
      expect(titleText).toHaveAttribute("data-tip", "A test entry");
      expect(await ui.link()).toHaveAttribute("href", "/stream/all/entry/101%3Aentry1");
    });
  });

  describe("when direct-open is set for the feed", () => {
    const flagged = (entry: Entry) => {
      const client = newQueryClient();
      client.setQueryData(keys.preferences, { [directOpenKey(entry.feedId)]: "visit" });
      return setup({ entry, client });
    };

    it("replaces the card with an external anchor and flags the wrapper", async () => {
      const { ui } = flagged(makeEntry());
      const card = await ui.link();
      expect(card).toHaveAttribute("href", ORIGINAL);
      expect(card).toHaveAttribute("target", "_blank");
      expect(card).toHaveAttribute("rel", "noopener");
      expect(await ui.wrapper()).toHaveAttribute("data-direct-open", "");
      expect(await ui.chip()).toBeInTheDocument();
      expect(await ui.titleLink()).toHaveAttribute("data-tip-overflow", "Opens on its site");
    });

    it("marks an unread entry read as it opens", async () => {
      const user = userEvent.setup();
      const { ui, router, onToggleRead } = flagged(makeEntry());
      await user.click(await ui.link());
      expect(onToggleRead).toHaveBeenCalledTimes(1);
      expect(router.state.location.pathname).toBe("/");
    });

    it("keeps the title link opening the original", async () => {
      const { ui } = flagged(makeEntry());
      expect(await ui.titleLink()).toHaveAttribute("href", ORIGINAL);
    });

    it("leaves a read entry alone", async () => {
      const user = userEvent.setup();
      const { ui, onToggleRead } = flagged(makeEntry({ unread: false }));
      await user.click(await ui.link());
      expect(onToggleRead).not.toHaveBeenCalled();
    });

    it("keeps the route card when the entry has no original to open", async () => {
      const { ui } = flagged(makeEntry({ url: undefined }));
      expect(await ui.link()).not.toHaveAttribute("href", ORIGINAL);
      expect(await ui.wrapper()).not.toHaveAttribute("data-direct-open");
    });
  });

  describe("when a card opens for the reader's view transition", () => {
    it("marks the card that opens, one card at a time", async () => {
      const first = setup({ entry: makeEntry() });
      const second = setup({ entry: makeEntry({ id: "entry-2", title: "Another entry" }) });
      const firstWrapper = await first.ui.wrapper();
      const secondWrapper = await second.ui.wrapper();

      await userEvent.click(await first.ui.link());
      expect(firstWrapper).toHaveAttribute("data-opening");

      await userEvent.click(await second.ui.link());
      expect(secondWrapper).toHaveAttribute("data-opening");
      expect(firstWrapper).not.toHaveAttribute("data-opening");
    });
  });

  describe("when swiped", () => {
    // jsdom has no pointer capture; the tile only asks for it.
    const withPointerCapture = () => {
      Object.defineProperty(Element.prototype, "setPointerCapture", {
        value: () => {},
        configurable: true,
      });
    };

    // A one-finger drag from the card's middle, in steps, ending `dx` to the right (negative: left).
    const swipe = ({
      target,
      dx,
      dy = 0,
      lift = true,
      pointerType = "touch",
    }: {
      target: Element;
      dx: number;
      dy?: number;
      lift?: boolean;
      pointerType?: string;
    }) => {
      const start = { clientX: 150, clientY: 100, pointerId: 1, pointerType };
      fireEvent.pointerDown(target, start);
      for (const step of [0.25, 0.5, 1]) {
        fireEvent.pointerMove(target, {
          ...start,
          clientX: start.clientX + dx * step,
          clientY: start.clientY + dy * step,
        });
      }
      if (lift)
        fireEvent.pointerUp(target, {
          ...start,
          clientX: start.clientX + dx,
          clientY: start.clientY + dy,
        });
    };

    it("reveals the action under the finger and flies out before telling the grid", async () => {
      withPointerCapture();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { ui, onToggleRead } = setup({
        entry: makeEntry(),
        swipeable: true,
        leavesWhenRead: true,
      });
      const wrapper = await ui.wrapper();
      swipe({ target: wrapper, dx: 160, lift: false });
      expect(await ui.action()).toHaveTextContent("Mark as read");
      expect(await ui.indicator()).toHaveAttribute("data-side", "left");
      expect(await ui.reveal()).toBe("1");
      expect(wrapper).toHaveAttribute("data-armed");
      expect((await ui.mover())?.style.translate).toBe("160px 0");
      fireEvent.pointerUp(wrapper, {
        clientX: 310,
        clientY: 100,
        pointerId: 1,
        pointerType: "touch",
      });
      // The card keeps going past its slot; the grid hears about it only once it is out.
      expect((await ui.mover())?.style.translate).toBe("324px 0");
      expect(onToggleRead).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(onToggleRead).toHaveBeenCalledTimes(1);
    });

    it("swipes left too, and a card that stays snaps back and flips at once", async () => {
      withPointerCapture();
      const { ui, onToggleRead } = setup({
        entry: makeEntry({ unread: false }),
        swipeable: true,
        leavesWhenRead: true,
      });
      const wrapper = await ui.wrapper();
      swipe({ target: wrapper, dx: -160, lift: false });
      expect(await ui.action()).toHaveTextContent("Mark as unread");
      expect(await ui.indicator()).toHaveAttribute("data-side", "right");
      fireEvent.pointerUp(wrapper, {
        clientX: -10,
        clientY: 100,
        pointerId: 1,
        pointerType: "touch",
      });
      expect(onToggleRead).toHaveBeenCalledTimes(1);
      expect((await ui.mover())?.style.translate).toBe("0px 0");
    });

    it("tints the action with the finger, then eases it back after a short swipe", async () => {
      withPointerCapture();
      const { ui, onToggleRead } = setup({ entry: makeEntry(), swipeable: true });
      const wrapper = await ui.wrapper();
      swipe({ target: wrapper, dx: 60, lift: false });
      // Half way to the 120px threshold, following the finger with no easing.
      expect(await ui.reveal()).toBe("0.5");
      expect((await ui.action())?.style.transition).toBe("none");
      expect(wrapper).not.toHaveAttribute("data-armed");
      fireEvent.pointerUp(wrapper, {
        clientX: 210,
        clientY: 100,
        pointerId: 1,
        pointerType: "touch",
      });
      expect(onToggleRead).not.toHaveBeenCalled();
      expect((await ui.mover())?.style.translate).toBe("0px 0");
      // The panel stays mounted and hands the fade to the stylesheet's transition.
      expect(await ui.reveal()).toBe("0");
      expect((await ui.action())?.style.transition).toBe("");
    });

    it("cancels the scroll a drifting finger would start once the swipe is under way", async () => {
      withPointerCapture();
      const { ui } = setup({ entry: makeEntry(), swipeable: true });
      const wrapper = await ui.wrapper();
      const before = new Event("touchmove", { cancelable: true, bubbles: true });
      wrapper.dispatchEvent(before);
      expect(before.defaultPrevented).toBe(false);
      swipe({ target: wrapper, dx: 60, lift: false });
      const during = new Event("touchmove", { cancelable: true, bubbles: true });
      wrapper.dispatchEvent(during);
      expect(during.defaultPrevented).toBe(true);
    });

    it("leaves a mostly vertical drag to the scroll", async () => {
      withPointerCapture();
      const { ui, onToggleRead } = setup({ entry: makeEntry(), swipeable: true });
      const wrapper = await ui.wrapper();
      swipe({ target: wrapper, dx: 20, dy: 120, lift: false });
      expect(await ui.reveal()).toBe("0");
      fireEvent.pointerUp(wrapper, {
        clientX: 400,
        clientY: 220,
        pointerId: 1,
        pointerType: "touch",
      });
      expect(onToggleRead).not.toHaveBeenCalled();
    });

    it("ignores a mouse drag and a grid with more than one column", async () => {
      withPointerCapture();
      const mouse = setup({ entry: makeEntry(), swipeable: true });
      swipe({ target: await mouse.ui.wrapper(), dx: 200, pointerType: "mouse" });
      expect(mouse.onToggleRead).not.toHaveBeenCalled();
      mouse.router.history.destroy();
      const wide = setup({ entry: makeEntry({ id: "entry-2", title: "Another entry" }) });
      swipe({ target: await wide.ui.wrapper(), dx: 200 });
      expect(wide.onToggleRead).not.toHaveBeenCalled();
    });
  });
});
