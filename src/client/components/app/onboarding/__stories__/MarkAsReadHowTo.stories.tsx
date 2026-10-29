import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { MarkAsReadHowTo } from "client/components/app/onboarding/MarkAsReadHowTo";
import { withUrl } from "stories/decorators";

const meta = {
  title: "App/Onboarding/MarkAsReadHowTo",
  component: MarkAsReadHowTo,
  decorators: [withUrl],
  parameters: { url: "/stream/all" },
  args: { open: true, onClose: fn(), returnFocusRef: { current: null } },
} satisfies Meta<typeof MarkAsReadHowTo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const ReaderTab: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Reader" }));
    await expect(canvas.getByRole("tabpanel", { name: "Reader" })).toHaveTextContent("Esc");
  },
};

export const AllRead: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const marks = () => canvas.queryAllByRole("button", { name: "Mark as read" });
    for (let remaining = marks().length - 1; remaining >= 0; remaining--) {
      await userEvent.click(marks()[0]);
      await waitFor(async () => {
        await expect(marks()).toHaveLength(remaining);
      });
    }
    await expect(await canvas.findByRole("button", { name: "Reset" })).toBeVisible();
  },
};
