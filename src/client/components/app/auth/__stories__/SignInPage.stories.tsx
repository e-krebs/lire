import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignIn } from "client/components/app/auth/SignIn";
import type { SignInProps } from "client/components/app/auth/SignIn";
import { AppShell } from "client/components/app/shell/AppShell";
import { withQueryClient, withUrl } from "stories/decorators";

// The signed-out app as the root route renders it: the shell, then the sign-in screen in place of
// the content.
const SignInPage = (props: SignInProps) => (
  <AppShell>
    <SignIn {...props} />
  </AppShell>
);

const meta = {
  title: "App/Auth/SignInPage",
  component: SignInPage,
  decorators: [withUrl, withQueryClient],
  parameters: { layout: "fullscreen", url: "/" },
} satisfies Meta<typeof SignInPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {};

export const CallbackFailedPage: Story = {
  args: { failure: "failed" },
};

export const CallbackDeniedPage: Story = {
  args: { failure: "denied" },
};

export const CallbackExpiredPage: Story = {
  args: { failure: "expired" },
};
