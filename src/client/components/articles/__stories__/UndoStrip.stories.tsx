import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { UndoStrip } from "client/components/articles/UndoStrip";

const meta = {
  title: "Components/UndoStrip",
  component: UndoStrip,
  decorators: [
    (Story) => (
      <div className="relative h-24 w-96">
        <Story />
      </div>
    ),
  ],
  args: { slot: { x: 0, y: 0, width: 384 }, onUndo: fn(), onConfirm: fn() },
} satisfies Meta<typeof UndoStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
