import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignIn } from "client/components/app/auth/SignIn";

const meta = {
  title: "App/Auth/SignIn",
  component: SignIn,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SignIn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
