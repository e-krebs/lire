import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { TopBar } from "client/components/shell/TopBar";
import { withQueryClient, withTier, withUrl } from "stories/decorators";
import type { Tier } from "stories/decorators";

const LOADED = { timeout: 10_000 };
const TECH = "0efbd7ec-69a4-40b7-8e99-619c3c4d5054";

interface Args {
  tier: Tier;
}

const meta: Meta<Args> = {
  title: "Shell/TopBar",
  decorators: [withTier, withUrl, withQueryClient],
  parameters: { layout: "fullscreen", url: "/" },
  argTypes: { tier: { control: "inline-radio", options: ["phone", "desktop"] } },
  args: { tier: "desktop" },
  render: () => <TopBar />,
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const field = await canvas.findByRole("searchbox", { name: "Search articles and feeds" });
    await userEvent.type(field, "tech");
    await body.findByText("Matches", {}, LOADED);
    await waitFor(async () => {
      await expect(body.getAllByText(/tech/i).length).toBeGreaterThan(2);
    }, LOADED);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");
    await userEvent.click(canvas.getByRole("button", { name: "Clear search text" }));
    await expect(field).toHaveValue("");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(document.body);
  },
};

export const CategoryScope: Story = {
  parameters: { url: `/stream/${TECH}?q=rss` },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = await canvas.findByRole("searchbox", { name: "Search articles and feeds" });
    await canvas.findByRole("link", { name: "Edit Tech News" }, LOADED);
    await expect(field).toHaveValue("rss");
    await userEvent.click(canvas.getByRole("button", { name: "Unread only" }));
    await userEvent.click(canvas.getByRole("button", { name: "Unread only" }));
    await userEvent.click(canvas.getByRole("button", { name: "Clear search text" }));
    await waitFor(async () => {
      await expect(field).toHaveValue("");
    });
    await userEvent.keyboard("{Home}{Backspace}");
    await waitFor(async () => {
      await expect(
        canvas.queryByRole("button", { name: /Search everywhere instead of/ }),
      ).toBeNull();
    });
  },
};

export const FeedScope: Story = {
  parameters: { url: "/stream/feed:http%3A%2F%2Fexample-news.test%2Frss" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("link", { name: "Edit Example News" }, LOADED);
    await userEvent.click(canvas.getByRole("button", { name: /Search everywhere instead of/ }));
  },
};

export const ReadStream: Story = { parameters: { url: "/stream/read" } };

export const Subscriptions: Story = {
  parameters: { url: "/subscriptions" },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Go back" }));
  },
};

export const Phone: Story = {
  args: { tier: "phone" },
  parameters: { url: `/stream/${TECH}` },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Open navigator" }));
    const field = await body.findByRole("searchbox", { name: "Search articles and feeds" });
    await userEvent.type(field, "design");
    await body.findByText("Matches", {}, LOADED);
    await userEvent.keyboard("{ArrowDown}{Enter}");
  },
};
