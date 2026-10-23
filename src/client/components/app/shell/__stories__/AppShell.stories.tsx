import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AppShell } from "client/components/app/shell/AppShell";
import { withQueryClient, withUrl } from "stories/decorators";

const meta = {
  title: "App/Shell/AppShell",
  decorators: [withUrl, withQueryClient],
  parameters: { layout: "fullscreen", url: "/subscriptions" },
  render: () => (
    <AppShell>
      <p className="p-6 text-sm text-muted">Content</p>
    </AppShell>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// Signed out: no top bar and no account menu, the content scrolls inside `main`.
export const Bare: Story = {
  render: () => (
    <AppShell bare>
      <p className="p-6 text-sm text-muted">Content</p>
    </AppShell>
  ),
};

// The menu under the cog shows the signed-in user name, so the page reads as an account.
export const AccountMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Account and app info" });
    await userEvent.click(trigger);
    await waitFor(async () => {
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
    });
    const menu = await within(document.body).findByRole("group", { name: "Account and app info" });
    await within(menu).findByText("ada-reader", {}, { timeout: 10_000 });
  },
};
