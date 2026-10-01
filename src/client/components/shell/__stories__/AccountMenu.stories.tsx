import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountMenu } from "client/components/shell/AccountMenu";
import { withQueryClient, withRouteMatch } from "stories/decorators";

interface Args {
  open: boolean;
}

const meta: Meta<Args> = {
  title: "Components/AccountMenu",
  decorators: [withRouteMatch, withQueryClient],
  args: { open: true },
  render: function Render({ open }) {
    const [, updateArgs] = useArgs<Args>();
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const popover = wrapperRef.current?.querySelector<HTMLElement>("[popover]");
      if (!popover) return;
      if (open && !popover.matches(":popover-open")) popover.showPopover();
      if (!open && popover.matches(":popover-open")) popover.hidePopover();
    }, [open]);

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
    await within(menu).findByText("Ada Reader", {}, { timeout: 10_000 });
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
