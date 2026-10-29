import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { OriginalSiteHowTo } from "client/components/app/onboarding/OriginalSiteHowTo";
import { withUrl } from "stories/decorators";

const meta = {
  title: "App/Onboarding/OriginalSiteHowTo",
  component: OriginalSiteHowTo,
  decorators: [withUrl],
  parameters: { url: "/stream/all" },
  args: { open: true, onClose: fn(), returnFocusRef: { current: null } },
} satisfies Meta<typeof OriginalSiteHowTo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const StoryTabOn: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox", { name: "Opens on its site" }));
    await userEvent.click(canvas.getByRole("tab", { name: "Story" }));
    await expect(canvas.getByRole("tabpanel", { name: "Story" })).toHaveTextContent(
      "opens on its site",
    );
  },
};
