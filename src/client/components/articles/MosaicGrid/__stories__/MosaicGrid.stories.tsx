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
    streamId: "user/5f3d4b2a-1234-4c56-8def-9876543210ab/category/global.all",
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

export const Navigation: Story = {
  decorators: [Wide],
  play: async ({ canvasElement }) => {
    const [first] = await tiles(canvasElement);
    first.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowRight}{ArrowLeft}{ArrowUp}{End}{Home}");
    await userEvent.keyboard("{ArrowUp}{ArrowLeft}x");
    await expect(first).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect(first).not.toHaveFocus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    await userEvent.click(first);
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
    const canvas = within(canvasElement);
    await tiles(canvasElement);
    const first = canvasElement.querySelector<HTMLElement>("[data-entry-id]");
    if (!first) throw new Error("no tile");
    const id = first.dataset.entryId;
    await swipe({ target: first, dx: 160 });
    await userEvent.click(await canvas.findByRole("button", { name: /undo/i }, TIMEOUT));
    await waitFor(
      async () =>
        expect(
          canvasElement.querySelector(`[data-entry-id="${CSS.escape(id ?? "")}"]`),
        ).not.toBeNull(),
      TIMEOUT,
    );
    const again = canvasElement.querySelector<HTMLElement>("[data-entry-id]");
    if (!again) throw new Error("no tile");
    await swipe({ target: again, dx: -160 });
    await userEvent.click(await canvas.findByRole("button", { name: /confirm/i }, TIMEOUT));
    await waitFor(
      async () => expect(canvas.queryByRole("button", { name: /undo/i })).toBeNull(),
      TIMEOUT,
    );
  },
};

export const KeyboardMarkRead: Story = {
  args: { unreadOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [first] = await tiles(canvasElement);
    first.focus();
    await userEvent.keyboard("m");
    await userEvent.click(await canvas.findByRole("button", { name: /confirm/i }, TIMEOUT));
    await waitFor(
      async () => expect(canvas.queryByRole("button", { name: /confirm/i })).toBeNull(),
      TIMEOUT,
    );
  },
};

export const Empty: Story = {
  args: { streamId: "feed/http://nothing.test/rss" },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Nothing to read here.", {}, TIMEOUT);
    const pane = canvasElement.querySelector(".scroll-pane");
    if (!pane) throw new Error("scroll pane missing");
    fire({ target: pane, type: "touchstart", y: 100 });
    for (const y of [140, 200, 300]) fire({ target: pane, type: "touchmove", y });
    fire({ target: pane, type: "touchend" });
    await userEvent.click(within(canvasElement).getByRole("link", { name: /show all/i }));
  },
};

export const LoadFailed: Story = {
  // The fixture search answers 400 for an empty stream id, which the stream endpoint accepts.
  args: { streamId: "", query: "news" },
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
