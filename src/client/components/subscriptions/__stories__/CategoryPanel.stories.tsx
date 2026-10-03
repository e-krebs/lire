import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { resetFixtureState } from "client/api/adapters/fixture";
import { CategoryPanel } from "client/components/subscriptions/CategoryPanel";
import { withQueryClient } from "stories/decorators";
import { CATEGORIES, FEEDS } from "stories/fixtures";

const SLOW = { timeout: 10_000 };

const sharedFeeds = FEEDS.map((feed, index) =>
  index === 0 ? { ...feed, categoryIds: [...feed.categoryIds, CATEGORIES[1].id] } : feed,
);

const meta = {
  title: "Subscriptions/CategoryPanel",
  component: CategoryPanel,
  decorators: [withQueryClient],
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    resetFixtureState();
  },
  argTypes: {
    category: { control: false },
    onClose: { control: false },
    onOpenFeed: { control: false },
    onAddWebsite: { control: false },
    onAddNewsletter: { control: false },
  },
  args: {
    category: CATEGORIES[0],
    categories: CATEGORIES,
    allFeeds: FEEDS,
    onClose: fn(),
    onOpenFeed: fn(),
    onAddWebsite: fn(),
    onAddNewsletter: fn(),
  },
} satisfies Meta<typeof CategoryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SharedFeed: Story = {
  args: { allFeeds: sharedFeeds },
  play: async ({ args }) => {
    const panel = await screen.findByRole("complementary", { name: "Tech" });
    await userEvent.click(within(panel).getByRole("button", { name: "Example Tech Daily" }));
    await expect(args.onOpenFeed).toHaveBeenCalledOnce();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Remove Example Tech Daily from Tech" }),
    );
    await waitFor(async () => {
      await expect(
        within(panel).getByRole("button", { name: "Remove Example Tech Daily from Tech" }),
      ).toBeEnabled();
    }, SLOW);
  },
};

export const SingleCategory: Story = {
  args: { categories: [CATEGORIES[0]] },
  play: async () => {
    const panel = await screen.findByRole("complementary", { name: "Tech" });
    const locked = within(panel).getByRole("button", { name: "Delete category…" });
    await expect(locked).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(locked);
    await expect(screen.queryByRole("dialog")).toBeNull();
  },
};

export const DeleteCategory: Story = {
  play: async ({ args }) => {
    const panel = await screen.findByRole("complementary", { name: "Tech" });
    await userEvent.click(within(panel).getByRole("button", { name: "Delete category…" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Tech?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(async () => {
      await expect(screen.queryByRole("dialog")).toBeNull();
    });
    await userEvent.click(within(panel).getByRole("button", { name: "Delete category…" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("radio", { name: "Design" }),
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^Delete and move \d+ feeds?$/,
      }),
    );
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalledOnce();
    }, SLOW);
  },
};

export const AddWebsite: Story = {
  play: async ({ args }) => {
    const panel = await screen.findByRole("complementary", { name: "Tech" });
    await userEvent.click(within(panel).getByRole("button", { name: "＋ Add sources" }));
    await userEvent.click(await screen.findByRole("button", { name: "Add website" }));
    await expect(args.onAddWebsite).toHaveBeenCalledOnce();
  },
};

export const Rename: Story = {
  play: async ({ args }) => {
    const panel = await screen.findByRole("complementary", { name: "Tech" });
    const name = within(panel).getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Technology");
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalledOnce();
    }, SLOW);
  },
};
