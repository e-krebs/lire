import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent } from "storybook/test";
import { AddSourcesMenu } from "client/components/subscriptions/AddSourcesMenu";
import { addButtonClassName } from "client/components/subscriptions/FeedsTab";

const meta = {
  title: "Subscriptions/AddSourcesMenu",
  component: AddSourcesMenu,
  argTypes: {
    onAddWebsite: { control: false },
    onAddNewsletter: { control: false },
    className: { control: false },
  },
  args: {
    onAddWebsite: fn(),
    onAddNewsletter: fn(),
    className: addButtonClassName,
  },
} satisfies Meta<typeof AddSourcesMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args }) => {
    await userEvent.click(await screen.findByRole("button", { name: "＋ Add sources" }));
    await userEvent.click(await screen.findByRole("button", { name: "Add website" }));
    await expect(args.onAddWebsite).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "＋ Add sources" }));
    await userEvent.click(await screen.findByRole("button", { name: "Add newsletter" }));
    await expect(args.onAddNewsletter).toHaveBeenCalledOnce();
  },
};

export const Open: Story = {
  play: async () => {
    await userEvent.click(await screen.findByRole("button", { name: "＋ Add sources" }));
    await expect(await screen.findByRole("group", { name: "Add sources" })).toBeVisible();
  },
};
