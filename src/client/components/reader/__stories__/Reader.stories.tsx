import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Reader } from "client/components/reader/Reader";
import { withQueryClient, withUrl } from "stories/decorators";

const LOADED = { timeout: 10_000 };

const meta = {
  title: "Components/Reader",
  component: Reader,
  decorators: [withUrl, withQueryClient],
  parameters: { layout: "fullscreen", url: "/stream/all/news-0029" },
  args: { entryId: "news-0029", streamKey: "all" },
} satisfies Meta<typeof Reader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Resize: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const separator = await canvas.findByRole("separator", { name: "Resize the article panel" });
    const width = (): number => Number(separator.getAttribute("aria-valuenow"));
    separator.focus();
    const start = width();
    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(async () => {
      await expect(width()).toBeGreaterThan(start);
    });
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await waitFor(async () => {
      await expect(width()).toBeLessThan(start);
    });
    await userEvent.keyboard("{Home}");
    await waitFor(async () => {
      await expect(width()).toBe(Number(separator.getAttribute("aria-valuemin")));
    });
    await userEvent.keyboard("{End}");
    await waitFor(async () => {
      await expect(width()).toBe(Number(separator.getAttribute("aria-valuemax")));
    });
    await userEvent.keyboard("{a}");
    await userEvent.keyboard("{Home}");
  },
};

export const Keep: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /^Keep/ }, LOADED));
  },
};

export const Mark: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /^Mark as/ }, LOADED));
  },
};

export const EscapeAndScrim: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: /^Mark as/ }, LOADED);
    await userEvent.keyboard("{Escape}");
    const scrim = canvasElement.querySelector(".reader-scrim");
    if (scrim instanceof HTMLElement) await userEvent.click(scrim);
  },
};

export const NotFound: Story = {
  args: { entryId: "missing-entry" },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("alert", {}, LOADED);
  },
};
