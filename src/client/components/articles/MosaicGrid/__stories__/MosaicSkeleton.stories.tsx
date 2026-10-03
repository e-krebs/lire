import type { Meta, StoryObj } from "@storybook/react-vite";
import { MosaicSkeleton } from "client/components/articles/MosaicGrid/MosaicSkeleton";

const meta = {
  title: "Components/MosaicSkeleton",
  component: MosaicSkeleton,
  decorators: [
    (Story) => (
      <div className="w-[64rem] max-w-full bg-surface">
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
