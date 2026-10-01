import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ViewToggles } from "client/components/navigation/ViewToggles";
import { withRouter } from "stories/decorators";

const meta = {
  title: "Components/ViewToggles",
  component: ViewToggles,
  decorators: [withRouter],
  args: { streamId: "user/1/category/global.all", search: {} },
} satisfies Meta<typeof ViewToggles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Unread only" }));
    await userEvent.click(canvas.getByRole("button", { name: "Oldest first" }));
  },
};

export const OldestFirst: Story = {
  args: { search: { unread: false, ranked: "oldest" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Unread only" }));
    await userEvent.click(canvas.getByRole("button", { name: "Oldest first" }));
  },
};

export const Searching: Story = {
  args: { search: { q: "rss" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sort = canvas.getByRole("button", { name: "Oldest first" });
    await userEvent.click(sort);
    await expect(sort).toHaveAttribute("aria-disabled", "true");
  },
};

export const ReadStream: Story = {
  args: { streamId: "user/1/tag/global.read" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "Unread only" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Oldest first" }));
  },
};
