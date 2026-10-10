import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { MosaicGrid } from "client/components/articles/MosaicGrid";
import { withQueryClient, withRouteMatch } from "stories/decorators";
import { swipe } from "client/components/articles/__stories__/swipe";

const touch = ({ target, y }: { target: Element; y: number }) =>
  new Touch({ identifier: 1, target, clientX: 150, clientY: y });

const fire = ({ target, type, y }: { target: Element; type: string; y?: number }) => {
  const touches = y === undefined ? [] : [touch({ target, y })];
  target.dispatchEvent(
    new TouchEvent(type, { touches, changedTouches: touches, bubbles: true, cancelable: true }),
  );
};

const firePair = ({ target, y }: { target: Element; y: number }) => {
  const touches = [
    touch({ target, y }),
    new Touch({ identifier: 2, target, clientX: 20, clientY: y }),
  ];
  target.dispatchEvent(
    new TouchEvent("touchmove", {
      touches,
      changedTouches: touches,
      bubbles: true,
      cancelable: true,
    }),
  );
};

const meta = {
  title: "Components/MosaicGrid",
  component: MosaicGrid,
  decorators: [
    withRouteMatch,
    withQueryClient,
    (Story) => (
      <div className="scroll-pane h-screen overflow-auto">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  args: {
    streamKey: "all",
    unreadOnly: false,
    ranked: "newest",
  },
} satisfies Meta<typeof MosaicGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const pane = canvasElement.querySelector(".scroll-pane");
    if (!pane) throw new Error("scroll pane missing");
    await waitFor(
      () => {
        if (pane.querySelector("a[aria-label]") === null) throw new Error("no tiles yet");
      },
      { timeout: 10_000 },
    );
    fire({ target: pane, type: "touchstart", y: 100 });
    for (const y of [140, 200, 300]) fire({ target: pane, type: "touchmove", y });
    fire({ target: pane, type: "touchend" });
  },
};

const TIMEOUT = { timeout: 10_000 };

const Narrow: Decorator = (Story) => (
  <div style={{ width: 360 }}>
    <Story />
  </div>
);

const Wide: Decorator = (Story) => (
  <div style={{ width: 1200 }}>
    <Story />
  </div>
);

const tiles = async (root: HTMLElement) => within(root).findAllByRole("link", {}, TIMEOUT);

// Re-read on every use: the grid remounts when the page-size tier settles, which detaches a held tile.
const firstTile = (root: HTMLElement) => within(root).getAllByRole("link")[0];

export const Navigation: Story = {
  decorators: [Wide],
  play: async ({ canvasElement }) => {
    await tiles(canvasElement);
    await waitFor(async () => {
      const first = firstTile(canvasElement);
      first.focus();
      await expect(first).toHaveFocus();
    }, TIMEOUT);
    await userEvent.keyboard("{ArrowDown}{ArrowRight}{ArrowLeft}{ArrowUp}{End}{Home}");
    await userEvent.keyboard("{ArrowUp}{ArrowLeft}x");
    await waitFor(async () => expect(firstTile(canvasElement)).toHaveFocus(), TIMEOUT);
    await userEvent.keyboard("{End}");
    await waitFor(async () => expect(firstTile(canvasElement)).not.toHaveFocus(), TIMEOUT);
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    await userEvent.click(firstTile(canvasElement));
  },
};

export const Refresh: Story = {
  play: async ({ canvasElement }) => {
    await tiles(canvasElement);
    await userEvent.keyboard("r");
    await userEvent.click(within(canvasElement).getByRole("button", { name: /refresh/i }));
    await waitFor(
      async () => expect(canvasElement.querySelector("a[aria-label]")).not.toBeNull(),
      TIMEOUT,
    );
  },
};

export const UnreadOnly: Story = {
  args: { unreadOnly: true, ranked: "oldest" },
  decorators: [Narrow],
  play: async ({ canvasElement }) => {
    await tiles(canvasElement);
    const first = canvasElement.querySelector<HTMLElement>("[data-entry-id]");
    if (!first) throw new Error("no tile");
    const id = first.dataset.entryId;
    await swipe({ target: first, dx: 160 });
    await waitFor(
      async () =>
        expect(canvasElement.querySelector(`[data-entry-id="${CSS.escape(id ?? "")}"]`)).toBeNull(),
      TIMEOUT,
    );
  },
};

export const KeyboardMarkRead: Story = {
  args: { unreadOnly: true },
  play: async ({ canvasElement }) => {
    const [first] = await tiles(canvasElement);
    const id = first.closest<HTMLElement>("[data-entry-id]")?.dataset.entryId;
    first.focus();
    await userEvent.keyboard("m");
    await waitFor(
      async () =>
        expect(canvasElement.querySelector(`[data-entry-id="${CSS.escape(id ?? "")}"]`)).toBeNull(),
      TIMEOUT,
    );
  },
};

export const Empty: Story = {
  args: { streamKey: "feed:999" },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Nothing to read here.", {}, TIMEOUT);
    const pane = canvasElement.querySelector(".scroll-pane");
    if (!pane) throw new Error("scroll pane missing");
    fire({ target: pane, type: "touchstart", y: 100 });
    for (const y of [140, 200, 300]) fire({ target: pane, type: "touchmove", y });
    fire({ target: pane, type: "touchend" });
    // The refresh swaps the empty state for the skeleton, so the link is only there again after it.
    await waitFor(async () => expect(pane.querySelector("[data-refreshing]")).toBeNull(), TIMEOUT);
    await userEvent.click(await within(canvasElement).findByRole("link", { name: /show all/i }));
  },
};

export const LoadFailed: Story = {
  // The search answers 400 for a feed key that isn't numeric.
  args: { streamKey: "feed:abc", query: "news" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("alert", {}, TIMEOUT);
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await canvas.findByRole("alert", {}, TIMEOUT);
  },
};

export const SearchResults: Story = {
  args: { query: "news" },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/Results for/, {}, TIMEOUT);
  },
};

export const SearchNoMatch: Story = {
  args: { query: "zzzzqqqq" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/No articles match/, {}, TIMEOUT);
    await userEvent.click(canvas.getByRole("link", { name: "Clear search" }));
  },
};

export const SearchTooShort: Story = {
  args: { query: "a" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/at least 2 characters/)).toBeVisible();
    await fireEvent.click(within(canvasElement).getByRole("link", { name: "Clear search" }));
  },
};

export const PullGestures: Story = {
  play: async ({ canvasElement }) => {
    const pane = canvasElement.querySelector(".scroll-pane");
    if (!pane) throw new Error("scroll pane missing");
    await tiles(canvasElement);
    fire({ target: pane, type: "touchstart", y: 100 });
    fire({ target: pane, type: "touchmove", y: 130 });
    fire({ target: pane, type: "touchend" });
    fire({ target: pane, type: "touchstart", y: 100 });
    fire({ target: pane, type: "touchmove", y: 140 });
    fire({ target: pane, type: "touchcancel" });
    fire({ target: pane, type: "touchstart", y: 100 });
    fire({ target: pane, type: "touchmove", y: 140 });
    firePair({ target: pane, y: 160 });
    fire({ target: pane, type: "touchstart", y: 100 });
    fire({ target: pane, type: "touchmove", y: 60 });
    fire({ target: pane, type: "touchstart", y: 100 });
    fire({ target: pane, type: "touchmove", y: 100 });
    fire({ target: pane, type: "touchstart", y: 100 });
    fire({ target: pane, type: "touchmove", y: 140 });
    fire({ target: pane, type: "touchstart", y: 100 });
    fire({ target: pane, type: "touchmove", y: 300 });
    fire({ target: pane, type: "touchend" });
    fire({ target: pane, type: "touchstart", y: 100 });
    fire({ target: pane, type: "touchmove", y: 300 });
    fire({ target: pane, type: "touchend" });
    await waitFor(async () => expect(pane.querySelector("[data-refreshing]")).toBeNull(), TIMEOUT);
  },
};
