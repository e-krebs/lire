import type { Meta, StoryObj } from "@storybook/react-vite";
import { PullIndicator } from "client/components/articles/PullIndicator";

interface Args {
  edge: "top" | "bottom";
  distance: number;
  armed: boolean;
  refreshing: boolean;
  released: boolean;
  pulling: boolean;
}

const meta = {
  title: "Components/PullIndicator",
  parameters: { layout: "fullscreen" },
  args: {
    pulling: true,
    edge: "top",
    distance: 48,
    armed: false,
    refreshing: false,
    released: false,
  },
  argTypes: {
    edge: { control: "inline-radio", options: ["top", "bottom"] },
    distance: { control: { type: "range", min: 0, max: 120 } },
  },
  render: ({ pulling, ...pull }) => <PullIndicator pull={pulling ? pull : null} />,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
