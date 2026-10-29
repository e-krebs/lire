import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ReaderHeader } from "client/components/reader/article/ReaderHeader";
import { ENTRY } from "stories/fixtures";
import { withQueryClient, withUrl } from "stories/decorators";

const meta = {
  title: "Reader/Article/ReaderHeader",
  component: ReaderHeader,
  decorators: [withQueryClient, withUrl],
  parameters: { layout: "fullscreen", url: "/stream/all" },
  args: {
    entry: ENTRY,
    originTitle: "Example Feed",
    minutes: 6,
    openedUnread: true,
    onKeep: fn(),
    onMark: fn(),
  },
} satisfies Meta<typeof ReaderHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
