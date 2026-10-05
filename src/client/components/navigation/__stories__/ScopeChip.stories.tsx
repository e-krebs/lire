import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { fn } from "storybook/test";
import { ScopeChip } from "client/components/navigation/ScopeChip";

type Args = ComponentProps<typeof ScopeChip> & { clearable: boolean };

const meta = {
  title: "Components/ScopeChip",
  component: ScopeChip,
  argTypes: { onClear: { control: false } },
  args: { label: "Technology", clearable: true, onClear: fn() },
  render: ({ clearable, onClear, ...args }) => (
    // The chip caps at 40% of its parent, which collapses in a shrink-to-fit story root.
    <div className="flex w-80">
      <ScopeChip {...args} onClear={clearable ? onClear : undefined} />
    </div>
  ),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const All: Story = { args: { label: "All", clearable: false } };

export const WithCount: Story = { args: { count: { count: 12, capped: false } } };

export const AllWithCount: Story = {
  args: { label: "All", clearable: false, count: { count: 50, capped: true } },
};

export const CountCapped: Story = { args: { count: { count: 50, capped: true } } };

export const NoMatches: Story = { args: { count: undefined } };

export const LongLabel: Story = {
  args: {
    label: "A feed with a title far too long for the room it gets",
    count: { count: 12, capped: false },
  },
};
