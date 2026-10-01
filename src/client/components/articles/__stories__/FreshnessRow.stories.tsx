import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FreshnessRow } from "client/components/articles/FreshnessRow";

const meta = {
  title: "Components/FreshnessRow",
  component: FreshnessRow,
  argTypes: { updatedAt: { control: "date" }, children: { control: false } },
  args: { updatedAt: Date.now() - 2 * 60_000, refreshing: false, onRefresh: fn() },
} satisfies Meta<typeof FreshnessRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
