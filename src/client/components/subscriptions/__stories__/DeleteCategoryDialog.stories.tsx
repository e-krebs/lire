import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { resetFixtureState } from "client/api/adapters/fixture";
import { DeleteCategoryDialog } from "client/components/subscriptions/DeleteCategoryDialog";
import { withQueryClient } from "stories/decorators";
import { CATEGORIES, FEEDS } from "stories/fixtures";

const SLOW = { timeout: 10_000 };

const meta = {
  title: "Subscriptions/DeleteCategoryDialog",
  component: DeleteCategoryDialog,
  decorators: [withQueryClient],
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    resetFixtureState();
  },
  argTypes: {
    category: { control: false },
    onCancel: { control: false },
    onDeleted: { control: false },
  },
  args: {
    open: true,
    category: CATEGORIES[0],
    categories: CATEGORIES,
    allFeeds: FEEDS,
    onCancel: fn(),
    onDeleted: fn(),
  },
} satisfies Meta<typeof DeleteCategoryDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MoveToNewCategory: Story = {
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: "Delete Tech?" });
    const confirm = within(dialog).getByRole("button", { name: /^Delete and move \d+ feeds?$/ });
    await expect(confirm).toBeDisabled();
    const filter = within(dialog).getByRole("searchbox", { name: "Filter categories" });
    await userEvent.type(filter, "Podcasts");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create “Podcasts”" }));
    await waitFor(async () => {
      await expect(confirm).toBeEnabled();
    }, SLOW);
    await userEvent.click(confirm);
    await waitFor(async () => {
      await expect(args.onDeleted).toHaveBeenCalledOnce();
    }, SLOW);
  },
};

export const MoveToExistingCategory: Story = {
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: "Delete Tech?" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "Design" }));
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^Delete and move \d+ feeds?$/ }),
    );
    await waitFor(async () => {
      await expect(args.onDeleted).toHaveBeenCalledOnce();
    }, SLOW);
  },
};

export const SharedFeeds: Story = {
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: "Delete Tech?" });
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: /Also move the feed that sits/ }),
    );
    await userEvent.click(within(dialog).getByRole("radio", { name: "Newsletters" }));
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^Delete and move \d+ feeds?$/ }),
    );
    await waitFor(async () => {
      await expect(args.onDeleted).toHaveBeenCalledOnce();
    }, SLOW);
  },
};

export const NoFeeds: Story = {
  args: {
    allFeeds: FEEDS.filter((feed) => !feed.categoryIds.includes(CATEGORIES[0].id)),
  },
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: "Delete Tech?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete category" }));
    await waitFor(async () => {
      await expect(args.onDeleted).toHaveBeenCalledOnce();
    }, SLOW);
  },
};

export const Cancel: Story = {
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: "Delete Tech?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(async () => {
      await expect(args.onCancel).toHaveBeenCalledOnce();
    });
  },
};
