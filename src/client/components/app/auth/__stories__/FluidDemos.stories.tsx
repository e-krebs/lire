import type { Meta, StoryObj } from "@storybook/react-vite";
import { FluidDemos } from "client/components/app/auth/landing/FluidDemos";

const meta = {
  title: "App/Auth/FluidDemos",
  component: FluidDemos,
} satisfies Meta<typeof FluidDemos>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
