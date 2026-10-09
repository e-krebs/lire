import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { MosaicSkeleton } from "client/components/articles/MosaicGrid/MosaicSkeleton";

const meta = {
  title: "Components/MosaicSkeleton",
  component: MosaicSkeleton,
  decorators: [
    (Story) => (
      <div className="w-5xl max-w-full bg-surface">
        <Story />
      </div>
    ),
  ],
  args: { label: "Loading articles" },
} satisfies Meta<typeof MosaicSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NextPageRow: Story = { args: { label: "Loading more articles", count: 4 } };

// The pane is shorter than the skeleton, so a scrollbar would show if it were not hidden.
export const WholeList: Story = {
  args: { wholeList: true },
  decorators: [
    (Story) => (
      <div className="scroll-pane h-64 w-5xl max-w-full bg-surface" data-testid="pane">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const pane = within(canvasElement).getByTestId("pane");
    await waitFor(async () => {
      await expect(pane).toHaveAttribute("data-skeleton");
    });
    await expect(getComputedStyle(pane).overflowY).toBe("hidden");
  },
};
