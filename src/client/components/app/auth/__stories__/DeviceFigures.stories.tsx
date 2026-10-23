import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeviceFigures } from "client/components/app/auth/landing/DeviceFigures";
import { listenForInstallPrompt } from "client/utils/installPrompt";

const meta = {
  title: "App/Auth/DeviceFigures",
  component: DeviceFigures,
} satisfies Meta<typeof DeviceFigures>;

export default meta;
type Story = StoryObj<typeof meta>;

// Stories share one window, so each one sets the install state it shows.
export const Default: Story = {
  beforeEach: () => {
    listenForInstallPrompt();
    window.dispatchEvent(new Event("appinstalled"));
  },
};

export const Installable: Story = {
  beforeEach: () => {
    listenForInstallPrompt();
    window.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      }),
    );
  },
};
