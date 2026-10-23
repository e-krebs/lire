import type { Meta, StoryObj } from "@storybook/react-vite";
import { Credits } from "client/components/app/credits/Credits";
import { withRouter } from "stories/decorators";

const meta: Meta<typeof Credits> = {
  title: "App/Credits/Credits",
  component: Credits,
  decorators: [withRouter],
  args: { signedOut: false },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};

export const SignedOut: Story = {
  args: { signedOut: true },
};
