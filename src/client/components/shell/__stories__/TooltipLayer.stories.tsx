import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { TooltipLayer } from "client/components/shell/TooltipLayer";
import { tip } from "client/utils/tooltip";

const meta = {
  title: "Shell/TooltipLayer",
  component: TooltipLayer,
  decorators: [
    (Story) => (
      <div className="flex flex-col items-center gap-8 p-16">
        <button
          type="button"
          className="rounded-lg border border-hairline px-3 py-2"
          {...tip({ label: "Refresh", shortcut: "R" })}
        >
          Refresh
        </button>
        <button
          type="button"
          className="rounded-lg border border-hairline px-3 py-2"
          {...tip({ label: "Search", shortcut: "Meta+K", side: "right" })}
        >
          Search
        </button>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TooltipLayer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByRole("button", { name: "Refresh" }));
    await expect(await canvas.findByRole("tooltip")).toBeInTheDocument();
    await userEvent.unhover(canvas.getByRole("button", { name: "Refresh" }));
    await userEvent.tab();
    await userEvent.tab();
  },
};

export const KeyboardAndPointer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const refresh = canvas.getByRole("button", { name: "Refresh" });
    const search = canvas.getByRole("button", { name: "Search" });
    await userEvent.tab();
    await expect(await canvas.findByRole("tooltip")).toHaveTextContent("Refresh");
    await userEvent.keyboard("{Escape}");
    await userEvent.tab();
    await waitFor(async () => {
      await expect(canvas.getByRole("tooltip")).toHaveTextContent("Search");
    });
    await userEvent.hover(refresh);
    await userEvent.unhover(refresh);
    await userEvent.hover(search);
    await userEvent.click(search);
    await userEvent.hover(refresh);
    await waitFor(async () => {
      await expect(canvas.getByRole("tooltip")).toHaveTextContent("Refresh");
    });
    window.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll", { bubbles: true }));
    refresh.remove();
    document.dispatchEvent(new Event("scroll", { bubbles: true }));
    await waitFor(async () => {
      await expect(canvas.getByRole("tooltip", { hidden: true })).not.toBeVisible();
    });
  },
};
