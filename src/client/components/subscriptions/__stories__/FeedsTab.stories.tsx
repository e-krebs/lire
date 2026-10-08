import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { FeedsTab } from "client/components/subscriptions/FeedsTab";
import { CATEGORIES, FEEDS } from "stories/fixtures";

const meta = {
  title: "Subscriptions/FeedsTab",
  component: FeedsTab,
  argTypes: {
    onOpenFeed: { control: false },
    onAddWebsite: { control: false },
    onAddNewsletter: { control: false },
  },
  args: {
    feeds: FEEDS,
    categories: CATEGORIES,
    openFeedId: undefined,
    onOpenFeed: fn(),
    onAddWebsite: fn(),
    onAddNewsletter: fn(),
  },
} satisfies Meta<typeof FeedsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AddWebsite: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add website" }));
    await expect(args.onAddWebsite).toHaveBeenCalledOnce();
  },
};

export const AddNewsletter: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add newsletter" }));
    await expect(args.onAddNewsletter).toHaveBeenCalledOnce();
  },
};

export const Empty: Story = {
  args: { feeds: [] },
};

export const TypeIconList: Story = {
  parameters: { layout: "padded" },
  args: {
    feeds: FEEDS.filter((feed) => ["101", "113", "111", "112"].includes(feed.id)).map((feed) =>
      feed.id === "112"
        ? { ...feed, title: "Example Digest with a very long title that must truncate" }
        : feed,
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("img", { name: "Newsletter" })).toHaveLength(2);
    await expect(canvas.getAllByRole("img", { name: "Website" })).toHaveLength(2);
    await expect(canvas.queryByText("weekly@example.test")).toBeNull();
  },
};
