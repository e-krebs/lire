import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { StepCards } from "client/components/app/auth/landing/StepCards";

const meta = {
  title: "App/Auth/StepCards",
  component: StepCards,
} satisfies Meta<typeof StepCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", {
      name: "Create a NewsBlur account",
    });

    await expect(link).toHaveAttribute("href", "https://newsblur.com/account/signup");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  },
};
