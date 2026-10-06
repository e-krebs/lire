import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, waitFor } from "storybook/test";
import type { Entry } from "shared/feedsApi/types";
import { layoutMasonry } from "client/utils/masonry";
import { textCardHeight } from "client/utils/textHeight";
import { directOpenKey } from "shared/feedsApi/preferences";
import { MosaicTile } from "client/components/articles/MosaicTile";
import { withRouter } from "stories/decorators";
import { ENTRY } from "stories/fixtures";
import { swipe } from "./swipe";

const PHOTO = "https://picsum.photos/id/1015/700/1000";

type Args = ComponentProps<typeof MosaicTile> & {
  gesture: "none" | "swipe" | "hold";
  image: boolean;
  directOpen: boolean;
};

const WithPreferences: Decorator<Args> = function WithPreferences(Story, { args }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  client.setQueryData(
    ["preferences"],
    args.directOpen ? { [directOpenKey(args.entry.feedId)]: "visit" } : {},
  );
  return (
    <QueryClientProvider client={client}>
      <Story />
    </QueryClientProvider>
  );
};

const meta = {
  title: "Components/MosaicTile",
  component: MosaicTile,
  decorators: [
    withRouter,
    WithPreferences,
    (Story) => (
      <div className="relative h-72 w-96">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    entry: { control: "object" },
    slot: { control: false },
    gesture: { control: "inline-radio", options: ["none", "swipe", "hold"] },
  },
  args: {
    streamKey: "all",
    entry: ENTRY,
    slot: { x: 0, y: 0, width: 384, height: 256 },
    tabIndex: 0,
    muteRead: true,
    swipeable: false,
    gesture: "none",
    image: false,
    directOpen: false,
    leavesWhenRead: false,
    onFocus: fn(),
    onKeyDown: fn(),
    onToggleRead: fn(),
  },
  // The grid owns the read flag, so the story flips `entry.unread` the way the grid would. A
  // tile that flew out stays gone until "Bring back" remounts it.
  render: function Render({ gesture, image, directOpen: _directOpen, ...args }) {
    const [, updateArgs] = useArgs();
    const [generation, setGeneration] = useState(0);
    const entry = { ...args.entry, imageUrl: image ? PHOTO : undefined };

    // A fresh tile per gesture, then a finger drags it 160px: "swipe" lifts, "hold" stays down.
    useEffect(() => {
      if (gesture === "none") return;
      const wrapper = document.querySelector<HTMLElement>("[data-entry-id]");
      if (wrapper) void swipe({ target: wrapper, dx: 160, lift: gesture === "swipe" });
    }, [gesture, generation]);

    return (
      <>
        <MosaicTile
          key={`${generation}-${gesture}`}
          {...args}
          entry={entry}
          swipeable={args.swipeable || gesture !== "none"}
          onToggleRead={() => {
            args.onToggleRead();
            updateArgs({ entry: { ...args.entry, unread: !args.entry.unread } });
          }}
        />
        <button
          type="button"
          onClick={() => {
            updateArgs({ entry: { ...args.entry, unread: true } });
            setGeneration((value) => value + 1);
          }}
          className="absolute -bottom-10 left-0 rounded border border-hairline px-2 py-1 text-xs text-ink"
        >
          Bring back
        </button>
      </>
    );
  },
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

// Triggers: hover the tile for the toggle button, focus it and press "m", or pick a gesture.
export const Default: Story = {};

const SHORT_TITLE = "Calm software";
const LONG_TITLE =
  "Why the best tools stay out of the way, and what building them for years teaches a small team about restraint, patience and the cost of every extra option";
// The feed that opens on the publisher's site; the other keeps the reader.
const DIRECT_FEED = "102";
// An image that cannot decode, so the tile falls back to text markup in its 3:2 slot.
const BROKEN_IMAGE = "data:image/png;base64,AAAA";

interface Variant {
  id: string;
  image: boolean;
  directOpen: boolean;
  long: boolean;
}

const VARIANTS: Variant[] = [false, true].flatMap((image) =>
  [false, true].flatMap((directOpen) =>
    [false, true].map((long) => ({
      id: `${image ? "img" : "txt"}-${directOpen ? "site" : "reader"}-${long ? "long" : "short"}`,
      image,
      directOpen,
      long,
    })),
  ),
);

const entryOf = ({ variant, imageUrl }: { variant: Variant; imageUrl?: string }): Entry => ({
  ...ENTRY,
  id: variant.id,
  feedId: variant.directOpen ? DIRECT_FEED : ENTRY.feedId,
  title: variant.long ? LONG_TITLE : SHORT_TITLE,
  imageUrl,
});

interface GalleryProps {
  width: number;
  entries: Entry[];
}

const Gallery = ({ width, entries }: GalleryProps) => {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  client.setQueryData(["preferences"], { [directOpenKey(DIRECT_FEED)]: "visit" });
  const layout = layoutMasonry({
    containerWidth: width,
    items: entries.map((entry) =>
      entry.imageUrl
        ? { id: entry.id, aspect: 3 / 2 }
        : {
            id: entry.id,
            heightAt: (columnWidth: number) =>
              textCardHeight({ title: entry.title, untitled: "Untitled", width: columnWidth }),
          },
    ),
  });
  return (
    <QueryClientProvider client={client}>
      <div data-gallery className="relative" style={{ width, height: layout.height }}>
        {entries.map((entry) => {
          const slot = layout.positions.get(entry.id);
          return slot ? (
            <MosaicTile
              key={entry.id}
              streamKey="all"
              entry={entry}
              slot={slot}
              tabIndex={-1}
              onFocus={fn()}
              onKeyDown={fn()}
              onToggleRead={fn()}
            />
          ) : null;
        })}
      </div>
    </QueryClientProvider>
  );
};

// A text card's content must fit the slot the grid measured for it, or the clamp cuts it short.
const expectTextCardsFit = async (root: HTMLElement) => {
  await document.fonts.ready;
  const cards = root.querySelectorAll<HTMLElement>("[data-entry-id]:not([data-has-image])");
  await expect(cards.length).toBeGreaterThan(0);
  for (const card of cards) {
    const glass = card.querySelector<HTMLElement>(".tile-glass");
    if (!glass) throw new Error("glass missing");
    await waitFor(async () => expect(glass.scrollHeight).toBeLessThanOrEqual(card.offsetHeight));
  }
};

const galleryEntries = VARIANTS.map((variant) =>
  entryOf({ variant, imageUrl: variant.image ? PHOTO : undefined }),
);

export const PhoneVariants: Story = {
  render: () => <Gallery width={390} entries={galleryEntries} />,
  play: async ({ canvasElement }) => expectTextCardsFit(canvasElement),
};

export const GridVariants: Story = {
  render: () => <Gallery width={1000} entries={galleryEntries} />,
  play: async ({ canvasElement }) => expectTextCardsFit(canvasElement),
};

// The layout keys off `entry.imageUrl`, so a failed image leaves text markup in a photo-shaped slot.
export const FailedImage: Story = {
  render: () => (
    <Gallery
      width={390}
      entries={[
        entryOf({
          variant: { id: "failed", image: true, directOpen: false, long: false },
          imageUrl: BROKEN_IMAGE,
        }),
        entryOf({
          variant: { id: "failed-site", image: true, directOpen: true, long: true },
          imageUrl: BROKEN_IMAGE,
        }),
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    await waitFor(async () =>
      expect(canvasElement.querySelectorAll("[data-entry-id]:not([data-has-image])")).toHaveLength(
        2,
      ),
    );
    for (const glass of canvasElement.querySelectorAll<HTMLElement>(".tile-glass")) {
      const card = glass.closest<HTMLElement>("[data-entry-id]");
      await expect(glass.scrollHeight).toBeLessThanOrEqual(card?.offsetHeight ?? 0);
      // Extra height goes above the feed row, so the title stays at the bottom edge.
      const title = glass.querySelector<HTMLElement>(".tile-title");
      const gap =
        (card?.getBoundingClientRect().bottom ?? 0) - (title?.getBoundingClientRect().bottom ?? 0);
      await expect(gap).toBeLessThanOrEqual(16);
    }
  },
};
