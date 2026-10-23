import type { Meta, StoryObj } from "@storybook/react-vite";
import { StepCards } from "client/components/app/auth/landing/StepCards";

const meta = {
  title: "App/Auth/StepCards",
  component: StepCards,
} satisfies Meta<typeof StepCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
