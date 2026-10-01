import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { resetFixtureState } from "client/api/adapters/fixture";
import { SubscribePanel } from "client/components/subscriptions/SubscribePanel";
import { withQueryClient } from "stories/decorators";
import { COLLECTIONS } from "stories/fixtures";

const SLOW = { timeout: 10_000 };

const meta = {
  title: "Subscriptions/SubscribePanel",
  component: SubscribePanel,
  decorators: [withQueryClient],
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    resetFixtureState();
  },
  argTypes: { onClose: { control: false } },
  args: { collections: COLLECTIONS, categoryId: undefined, onClose: fn() },
} satisfies Meta<typeof SubscribePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Preselected: Story = {
  args: { categoryId: COLLECTIONS[1].id },
  play: async () => {
    const panel = await screen.findByRole("complementary", { name: "Add a feed" });
    await expect(within(panel).getByRole("checkbox", { name: "Design" })).toBeChecked();
    await expect(within(panel).getByRole("button", { name: "Subscribe" })).toBeDisabled();
  },
};

export const Subscribe: Story = {
  play: async ({ args }) => {
    const panel = await screen.findByRole("complementary", { name: "Add a feed" });
    await userEvent.type(
      within(panel).getByRole("textbox", { name: "Feed or site URL" }),
      "example-news.test",
    );
    await within(panel).findByRole("radio", { name: /Example News — World Desk/ }, SLOW);
    await userEvent.click(within(panel).getByRole("radio", { name: /World Desk/ }));
    await userEvent.type(
      within(panel).getByRole("searchbox", { name: "Filter categories" }),
      "Podcasts",
    );
    await userEvent.click(within(panel).getByRole("button", { name: "Create “Podcasts”" }));
    await waitFor(async () => {
      await expect(within(panel).getByRole("button", { name: "Subscribe" })).toBeEnabled();
    }, SLOW);
    await userEvent.click(within(panel).getByRole("button", { name: "Subscribe" }));
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalledOnce();
    }, SLOW);
  },
};

export const Cancel: Story = {
  play: async ({ args }) => {
    const panel = await screen.findByRole("complementary", { name: "Add a feed" });
    await userEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
