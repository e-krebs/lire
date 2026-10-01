import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ChipSet } from "client/components/subscriptions/ChipSet";

const meta = {
  title: "Subscriptions/ChipSet",
  component: ChipSet,
  decorators: [
    (Story) => (
      <div style={{ width: "14rem" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    labels: ["Tech News", "Design", "Newsletters", "Archive", "Science", "Podcasts"],
    className: "w-full",
  },
} satisfies Meta<typeof ChipSet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/, also in/)).toBeInTheDocument();
  },
};
