import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import { MosaicTile } from "client/components/articles/MosaicTile";
import { withRouter } from "stories/decorators";
import { ENTRY } from "stories/fixtures";
import { swipe } from "./swipe";

const PHOTO = "https://picsum.photos/id/1015/700/1000";

// The text card's color is a hue derived from the feed id, so another feed is another color.
// Each id here hashes to a distinct hue.
const FEEDS = [
  "feed/http://example-news.test/rss",
  "feed/http://blog.test/atom",
  "feed/http://science.test/rss",
  "feed/http://games.test/rss",
  "feed/http://cooking.test/atom",
  "feed/http://news.test/rss",
  "feed/http://music.test/atom",
];

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
    args.directOpen ? { [`subscription/${args.streamId}/entryNavigation`]: "visit" } : {},
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
    streamId: { control: "select", options: FEEDS },
    entry: { control: "object" },
    slot: { control: false },
    gesture: { control: "inline-radio", options: ["none", "swipe", "hold"] },
  },
  args: {
    streamId: ENTRY.origin.streamId,
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
    const entry = {
      ...args.entry,
      origin: { ...args.entry.origin, streamId: args.streamId },
      visual: image ? { url: PHOTO, width: 700, height: 1000 } : undefined,
    };

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
