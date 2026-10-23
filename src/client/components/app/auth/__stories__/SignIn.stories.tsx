import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignIn } from "client/components/app/auth/SignIn";
import { withRouter, withUserAgent } from "stories/decorators";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const meta = {
  title: "App/Auth/SignIn",
  component: SignIn,
  decorators: [withRouter, withUserAgent],
  parameters: { layout: "fullscreen", userAgent: DESKTOP_UA },
} satisfies Meta<typeof SignIn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AndroidBrowser: Story = {
  parameters: { userAgent: ANDROID_UA },
};

// The TWA is marked by its session key, so the badge hides inside the app.
export const AndroidApp: Story = {
  parameters: { userAgent: ANDROID_UA },
  beforeEach: () => {
    window.sessionStorage.setItem("lire.twa", "true");
    return () => {
      window.sessionStorage.removeItem("lire.twa");
    };
  },
};

export const CallbackFailed: Story = {
  args: { failure: "failed" },
};

export const CallbackDenied: Story = {
  args: { failure: "denied" },
};

export const CallbackExpired: Story = {
  args: { failure: "expired" },
};
