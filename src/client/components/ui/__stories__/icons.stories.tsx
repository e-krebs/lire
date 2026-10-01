import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { ICON_NAMES, Icon } from "client/components/ui/icons";

type Args = Pick<ComponentProps<typeof Icon>, "name"> & { size: number; color?: string };

const meta: Meta<Args> = {
  title: "Components/Icon",
  parameters: { layout: "padded" },
  argTypes: {
    name: { control: "select", options: ICON_NAMES },
    size: { control: { type: "range", min: 12, max: 128 } },
    color: { control: "color" },
  },
  args: { name: "settings", size: 64 },
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
  render: ({ name, size, color }) => (
    <span className="block text-ink" style={{ width: size, height: size, color }}>
      <Icon name={name} className="size-full" />
    </span>
  ),
};

export const Gallery: Story = {
  args: { size: 32 },
  argTypes: { name: { control: false } },
  render: ({ size, color }) => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-4 text-ink">
      {ICON_NAMES.map((name) => (
        <li key={name} className="flex flex-col items-center gap-2 text-xs text-muted">
          <span className="block" style={{ width: size, height: size, color }}>
            <Icon name={name} className="size-full" />
          </span>
          {name}
        </li>
      ))}
    </ul>
  ),
};
