import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { resetFixtureState } from "client/api/adapters/fixture";
import { EmptyCategoryPanel } from "client/components/subscriptions/EmptyCategoryPanel";
import { withQueryClient } from "stories/decorators";
import { CATEGORIES, FEEDS } from "stories/fixtures";

const empty = { ...CATEGORIES[0], feedIds: [] };

const meta = {
  title: "Subscriptions/EmptyCategoryPanel",
  component: EmptyCategoryPanel,
  decorators: [withQueryClient],
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    resetFixtureState();
  },
  argTypes: {
    category: { control: false },
    onClose: { control: false },
    onAddWebsite: { control: false },
    onAddNewsletter: { control: false },
  },
  args: {
    category: empty,
    categories: [empty, ...CATEGORIES.slice(1)],
    allFeeds: FEEDS.filter((feed) => !feed.categoryIds.includes(empty.id)),
    onClose: fn(),
    onAddWebsite: fn(),
    onAddNewsletter: fn(),
  },
} satisfies Meta<typeof EmptyCategoryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AddWebsite: Story = {
  play: async ({ args }) => {
    await userEvent.click(await screen.findByRole("button", { name: "＋ Add sources" }));
    await userEvent.click(await screen.findByRole("button", { name: "Add website" }));
    await expect(args.onAddWebsite).toHaveBeenCalledOnce();
  },
};

export const Delete: Story = {
  play: async ({ args }) => {
    await userEvent.click(await screen.findByRole("button", { name: "Delete category…" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Tech?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(async () => {
      await expect(screen.queryByRole("dialog")).toBeNull();
    });
    await userEvent.click(screen.getByRole("button", { name: "Delete category…" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete category" }),
    );
    await waitFor(
      async () => {
        await expect(args.onClose).toHaveBeenCalledOnce();
      },
      { timeout: 10_000 },
    );
  },
};
