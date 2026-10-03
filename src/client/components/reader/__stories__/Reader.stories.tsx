import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Reader } from "client/components/reader/Reader";
import { withQueryClient, withUrl } from "stories/decorators";

const LOADED = { timeout: 10_000 };

const meta = {
  title: "Components/Reader",
  component: Reader,
  decorators: [withUrl, withQueryClient],
  parameters: { layout: "fullscreen", url: "/stream/all/entry/101:0dcd64" },
  args: { entryId: "101:0dcd64", streamKey: "all" },
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

const frameOf = (iframe: HTMLIFrameElement): { root: HTMLElement; win: Window } => {
  const root = iframe.contentDocument?.documentElement;
  const win = iframe.contentWindow;
  if (!root || !win) throw new Error("newsletter frame has no document");
  return { root, win };
};

// The frame adds the horizontal scrollbar to the content height, so the check does too.
const expectFrameFitsContent = async (iframe: HTMLIFrameElement): Promise<void> => {
  const { root, win } = frameOf(iframe);
  const scrollbar = Math.max(0, win.innerHeight - root.clientHeight);
  const content = root.getBoundingClientRect().height + scrollbar;
  await expect(Math.abs(iframe.getBoundingClientRect().height - content)).toBeLessThanOrEqual(2);
};

export const Newsletter: Story = {
  args: { entryId: "111:109bd3" },
  parameters: { url: "/stream/all/entry/111:109bd3" },
  // Below 64rem the reader panel fills its parent, so this relies on the 414px default viewport.
  decorators: [
    (Story) => (
      <div data-testid="newsletter-width" style={{ width: "390px" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const iframe = await waitFor(() => {
      const found = canvasElement.querySelector('iframe[title="Newsletter"]');
      if (!(found instanceof HTMLIFrameElement)) throw new Error("no newsletter frame yet");
      return found;
    }, LOADED);

    // Not `readyState`: the seed images come from the live picsum.photos and may never settle.
    await waitFor(async () => {
      await expect(iframe.getBoundingClientRect().height).toBeGreaterThan(150);
      await expectFrameFitsContent(iframe);
    }, LOADED);

    // A newsletter wider than the panel must scroll inside the frame, not clip.
    const { root, win } = frameOf(iframe);
    await expect(
      root.scrollWidth <= root.clientWidth || win.getComputedStyle(root).overflowX === "auto",
      `frame scrollWidth ${root.scrollWidth}, clientWidth ${root.clientWidth}`,
    ).toBe(true);

    const wrapper = within(canvasElement).getByTestId("newsletter-width");

    wrapper.style.width = "700px";
    await waitFor(async () => {
      await expectFrameFitsContent(iframe);
    }, LOADED);

    // Last: the forwarded Escape closes the reader and marks the entry read.
    const seen: string[] = [];
    const listener = (event: KeyboardEvent) => {
      seen.push(event.key);
    };
    document.addEventListener("keydown", listener);
    try {
      root.ownerDocument.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await expect(seen).toContain("Escape");
    } finally {
      document.removeEventListener("keydown", listener);
    }
  },
};

export const Embeds: Story = {
  args: { entryId: "102:1a2b3c" },
  parameters: { url: "/stream/all/entry/102:1a2b3c" },
  play: async ({ canvasElement }) => {
    const video = await waitFor(() => {
      const found = canvasElement.querySelector('iframe[src^="https://www.youtube.com/embed/"]');
      if (!(found instanceof HTMLIFrameElement)) throw new Error("no YouTube frame yet");
      return found;
    }, LOADED);
    await expect(video.getBoundingClientRect().height).toBeGreaterThan(150);
  },
};

export const TweetEmbed: Story = {
  args: { entryId: "102:1b3c4d" },
  parameters: { url: "/stream/all/entry/102:1b3c4d" },
  play: async ({ canvasElement }) => {
    const frame = await waitFor(() => {
      const found = canvasElement.querySelector('iframe[data-embed="x"]');
      if (!(found instanceof HTMLIFrameElement)) throw new Error("no X frame yet");
      return found;
    }, LOADED);
    await expect(frame.getAttribute("src")).toContain("platform.twitter.com/embed/Tweet.html");
    await expect(canvasElement.querySelector("script")).toBeNull();
  },
};

export const NotFound: Story = {
  args: { entryId: "missing-entry" },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("alert", {}, LOADED);
  },
};
