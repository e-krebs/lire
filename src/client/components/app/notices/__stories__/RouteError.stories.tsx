import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RouteError } from "client/components/app/notices/RouteError";

const meta = {
  title: "App/Notices/RouteError",
  component: RouteError,
  parameters: { layout: "fullscreen" },
  args: {
    error: new Error("Storybook fake error"),
    reset: fn(),
  },
  argTypes: {
    reset: { control: false },
    error: { control: false },
  },
} satisfies Meta<typeof RouteError>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
