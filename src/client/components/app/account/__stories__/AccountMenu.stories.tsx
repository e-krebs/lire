import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountMenu } from "client/components/app/account/AccountMenu";
import { listenForInstallPrompt } from "client/utils/installPrompt";
import { deferUpdate, registerPwa } from "client/utils/pwaUpdate";
import { withQueryClient, withRouteMatch, withUserAgent } from "stories/decorators";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

interface Args {
  open: boolean;
}

const meta: Meta<Args> = {
  title: "App/Account/AccountMenu",
  decorators: [withRouteMatch, withQueryClient, withUserAgent],
  parameters: { userAgent: DESKTOP_UA },
  args: { open: false },
  // Registering and clearing start from a clean state, so no story inherits the last one's.
  beforeEach: () => {
    registerPwa({ register: () => async () => {} });
    window.dispatchEvent(new Event("appinstalled"));
  },
  render: function Render({ open }) {
    const [, updateArgs, resetArgs] = useArgs<Args>();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const mounted = useRef(false);

    useEffect(() => {
      // Storybook keeps the last `open` of a story, so a revisit starts closed again.
      if (!mounted.current) {
        mounted.current = true;
        resetArgs();
        return;
      }
      const popover = wrapperRef.current?.querySelector<HTMLElement>("[popover]");
      if (!popover) return;
      if (open && !popover.matches(":popover-open")) popover.showPopover();
      if (!open && popover.matches(":popover-open")) popover.hidePopover();
    }, [open, resetArgs]);

    useEffect(() => {
      const popover = wrapperRef.current?.querySelector<HTMLElement>("[popover]");
      const sync = (): void => {
        updateArgs({ open: popover?.matches(":popover-open") ?? false });
      };
      popover?.addEventListener("toggle", sync);
      return () => {
        popover?.removeEventListener("toggle", sync);
      };
    }, [updateArgs]);

    return (
      <div ref={wrapperRef} className="flex h-80 justify-end p-4">
        <AccountMenu />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
  args: {
    open: false,
  },
};

// The Android link sits in the menu, so the story opens it.
export const AndroidBrowser: Story = {
  args: { open: false },
  parameters: { userAgent: ANDROID_UA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Account and app info" }));
    const link = await canvas.findByRole("link", { name: "Get the Android app" });
    await waitFor(async () => {
      await expect(link).toBeVisible();
    });
  },
};

const waitingUpdate = ({ deferred }: { deferred: boolean }) => {
  registerPwa({
    register: ({ onNeedRefresh }) => {
      onNeedRefresh();
      return async () => {};
    },
  });
  if (deferred) deferUpdate();
};

// The toast is up too: the menu entry shows beside it.
export const UpdateAvailable: Story = {
  args: { open: false },
  beforeEach: () => {
    waitingUpdate({ deferred: false });
  },
};

// After Later: the toast is gone, the dot marks the cog, the entry stays in the menu.
export const UpdateDeferred: Story = {
  args: { open: false },
  beforeEach: () => {
    waitingUpdate({ deferred: true });
  },
};

// The browser offered the prompt, so the menu lists Install Lire above the Android slot.
export const InstallAvailable: Story = {
  args: { open: false },
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

export const Interaction: Story = {
  args: { open: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Account and app info" });
    await userEvent.click(trigger);
    await waitFor(async () => {
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
    });
    const menu = await within(document.body).findByRole("group", { name: "Account and app info" });
    await within(menu).findByText("ada-reader", {}, { timeout: 10_000 });
    const toggle = within(menu).getByRole("checkbox", { name: "Bar at the bottom" });
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await expect(toggle).not.toBeChecked();
    await userEvent.click(document.body);
    await userEvent.click(within(menu).getByRole("link", { name: "Manage subscriptions" }));
    await waitFor(async () => {
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
    });
  },
};
