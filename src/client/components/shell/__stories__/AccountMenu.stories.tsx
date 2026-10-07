import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountMenu } from "client/components/shell/AccountMenu";
import { deferUpdate, registerPwa } from "client/utils/pwaUpdate";
import { withQueryClient, withRouteMatch } from "stories/decorators";

interface Args {
  open: boolean;
}

const meta: Meta<Args> = {
  title: "Components/AccountMenu",
  decorators: [withRouteMatch, withQueryClient],
  args: { open: false },
  // Registering starts from a clean update state, so no story inherits the last one's.
  beforeEach: () => {
    registerPwa({ register: () => async () => {} });
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
