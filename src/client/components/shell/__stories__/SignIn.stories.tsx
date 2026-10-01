import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignIn } from "client/components/shell/SignIn";

const meta = {
  title: "Components/SignIn",
  component: SignIn,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SignIn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
