import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CategoriesTab } from "client/components/subscriptions/CategoriesTab";
import { withQueryClient, withRouter } from "stories/decorators";
import { CATEGORIES } from "stories/fixtures";

const meta = {
  title: "Subscriptions/CategoriesTab",
  component: CategoriesTab,
  decorators: [withRouter, withQueryClient],
  argTypes: { onOpenCategory: { control: false } },
  args: { categories: CATEGORIES, openCategoryId: undefined, onOpenCategory: fn() },
} satisfies Meta<typeof CategoriesTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
