import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { DeviceFigures } from "client/components/app/auth/landing/DeviceFigures";
import { listenForInstallPrompt } from "client/utils/installPrompt";

const meta = {
  title: "App/Auth/DeviceFigures",
  component: DeviceFigures,
} satisfies Meta<typeof DeviceFigures>;

export default meta;
type Story = StoryObj<typeof meta>;

// Stories share one window, so each one sets the install and dismiss state it shows.
const resetInstallState = (): void => {
  window.localStorage.clear();
  listenForInstallPrompt();
};

export const Default: Story = {
  beforeEach: () => {
    resetInstallState();
    window.dispatchEvent(new Event("appinstalled"));
  },
};

export const Installable: Story = {
  beforeEach: () => {
    resetInstallState();
    window.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      }),
    );
  },
};

export const IOS: Story = {
  beforeEach: () => {
    resetInstallState();
    const original = Object.getOwnPropertyDescriptor(navigator, "userAgent");
    Object.defineProperty(navigator, "userAgent", { value: "iPhone", configurable: true });
    return () => {
      if (original) Object.defineProperty(navigator, "userAgent", original);
      else Reflect.deleteProperty(navigator, "userAgent");
    };
  },
};

export const Dismissed: Story = {
  beforeEach: Installable.beforeEach,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Dismiss" }));
  },
};

export const Installed: Story = {
  beforeEach: () => {
    resetInstallState();
    window.dispatchEvent(new Event("appinstalled"));
  },
};
