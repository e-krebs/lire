import type { Meta, StoryObj } from "@storybook/react-vite";
import { AndroidAppLink } from "client/components/app/android/AndroidAppLink";
import { withUserAgent } from "stories/decorators";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const meta: Meta<typeof AndroidAppLink> = {
  title: "App/Android/AndroidAppLink",
  component: AndroidAppLink,
  decorators: [withUserAgent],
  parameters: { userAgent: ANDROID_UA },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AndroidBrowser: Story = {};

// The TWA is marked by its session key, so the link hides inside the app.
export const AndroidApp: Story = {
  beforeEach: () => {
    window.sessionStorage.setItem("lire.twa", "true");
    return () => {
      window.sessionStorage.removeItem("lire.twa");
    };
  },
};

export const Desktop: Story = {
  parameters: { userAgent: DESKTOP_UA },
};
