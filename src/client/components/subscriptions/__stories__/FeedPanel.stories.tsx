import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { resetFixtureState } from "client/api/adapters/fixture";
import { FeedPanel } from "client/components/subscriptions/FeedPanel";
import { withQueryClient } from "stories/decorators";
import { CATEGORIES, FEEDS } from "stories/fixtures";

const SLOW = { timeout: 10_000 };

const meta = {
  title: "Subscriptions/FeedPanel",
  component: FeedPanel,
  decorators: [withQueryClient],
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    resetFixtureState();
  },
  argTypes: { feed: { control: false }, onClose: { control: false } },
  args: { feed: FEEDS[0], categories: CATEGORIES, onClose: fn() },
} satisfies Meta<typeof FeedPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Save: Story = {
  play: async ({ args }) => {
    const panel = await screen.findByRole("complementary", { name: "Example Tech Daily" });
    const title = within(panel).getByRole("textbox", { name: "Title" });
    await userEvent.clear(title);
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    await expect(
      await within(panel).findByText("Enter a title for this feed."),
    ).toBeInTheDocument();
    await userEvent.type(title, "Example Tech Daily Renamed");
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Design" }));
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Opens on its site" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalledOnce();
    }, SLOW);
  },
};

export const Unsubscribe: Story = {
  play: async ({ args }) => {
    const panel = await screen.findByRole("complementary", { name: "Example Tech Daily" });
    await userEvent.click(within(panel).getByRole("button", { name: "Unsubscribe…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Unsubscribe from Example Tech Daily?",
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(async () => {
      await expect(screen.queryByRole("dialog")).toBeNull();
    });
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Tech" }));
    await expect(
      within(panel).getByText("Clearing every box unsubscribes this feed."),
    ).toBeVisible();
    await userEvent.click(within(panel).getByRole("button", { name: "Unsubscribe…" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Unsubscribe" }),
    );
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalledOnce();
    }, SLOW);
  },
};

export const Reanalyze: Story = {
  args: { feed: FEEDS.find((feed) => feed.isWebFeed) ?? FEEDS[0] },
  play: async ({ args }) => {
    const panel = await screen.findByRole("complementary", { name: args.feed.title });
    await userEvent.click(within(panel).getByRole("button", { name: "Reanalyze" }));
    await userEvent.click(await within(panel).findByRole("radio", { name: /Sidebar links/ }, SLOW));
    await userEvent.click(within(panel).getByRole("button", { name: "Apply" }));
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalledOnce();
    }, SLOW);
  },
};
