import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SidePanel } from "client/components/subscriptions/SidePanel";
import { withTier } from "stories/decorators";
import type { Tier } from "stories/decorators";

type Args = ComponentProps<typeof SidePanel> & { tier: Tier };

const meta = {
  title: "Subscriptions/SidePanel",
  component: SidePanel,
  decorators: [withTier],
  argTypes: {
    tier: { control: "inline-radio", options: ["phone", "desktop"] },
    subtitle: { control: false },
    leading: { control: false },
    children: { control: false },
    actions: { control: false },
  },
  parameters: { layout: "fullscreen" },
  args: {
    tier: "desktop",
    open: true,
    title: "Example News",
    subtitle: "example-news.test",
    onClose: fn(),
    children: <p className="p-4 text-sm">Panel content.</p>,
  },
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithActions: Story = {
  args: {
    leading: <span className="size-3 rounded-full bg-accent" />,
    actions: (
      <button type="button" className="rounded-lg bg-accent px-3 py-2 text-on-accent">
        Save
      </button>
    ),
  },
};
export const Phone: Story = { args: { tier: "phone" } };
