import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { ConfirmDialog } from "client/components/subscriptions/ConfirmDialog";

const meta = {
  title: "Subscriptions/ConfirmDialog",
  component: ConfirmDialog,
  argTypes: {
    children: { control: false },
    extra: { control: false },
    onCancel: { control: false },
    onConfirm: { control: false },
  },
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    title: "Unsubscribe from Example News?",
    children: "Its articles leave your categories. You can subscribe again later.",
    confirmLabel: "Unsubscribe",
    onCancel: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithExtraField: Story = {
  args: {
    extra: (
      <label className="mt-3 flex flex-col gap-1 text-sm">
        Move its feeds to
        <select className="h-9 rounded-lg border border-hairline bg-surface px-2">
          <option>Uncategorized</option>
          <option>Tech</option>
        </select>
      </label>
    ),
  },
};

export const Confirm: Story = {
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: args.title });
    await userEvent.click(within(dialog).getByRole("button", { name: "Unsubscribe" }));
    await expect(args.onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(async () => {
      await expect(args.onCancel).toHaveBeenCalledOnce();
    });
  },
};

export const BackdropDismiss: Story = {
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: args.title });
    await userEvent.pointer({
      keys: "[MouseLeft]",
      target: dialog,
      coords: { clientX: 1, clientY: 1 },
    });
    await waitFor(async () => {
      await expect(args.onCancel).toHaveBeenCalledOnce();
    });
  },
};

export const Busy: Story = {
  args: { busy: true, confirmDisabled: true },
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", { name: args.title });
    await expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.pointer({
      keys: "[MouseLeft]",
      target: dialog,
      coords: { clientX: 1, clientY: 1 },
    });
    await expect(dialog).toHaveAttribute("open");
    await expect(args.onCancel).not.toHaveBeenCalled();
  },
};
