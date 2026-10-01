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
