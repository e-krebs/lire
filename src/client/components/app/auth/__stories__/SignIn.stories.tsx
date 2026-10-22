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

export const CallbackFailed: Story = {
  args: { failure: "failed" },
};

export const CallbackDenied: Story = {
  args: { failure: "denied" },
};

export const CallbackExpired: Story = {
  args: { failure: "expired" },
};
