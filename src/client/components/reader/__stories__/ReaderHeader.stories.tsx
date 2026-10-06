import { createRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ReaderHeader } from "client/components/reader/ReaderHeader";
import { ENTRY } from "stories/fixtures";
import { withQueryClient, withUrl } from "stories/decorators";

const meta = {
  title: "Components/ReaderHeader",
  component: ReaderHeader,
  decorators: [withQueryClient, withUrl],
  parameters: { layout: "fullscreen", url: "/stream/all" },
  argTypes: { paneRef: { control: false } },
  args: {
    entry: ENTRY,
    minutes: 6,
    openedUnread: true,
    paneRef: createRef<HTMLDivElement>(),
    onKeep: fn(),
    onMark: fn(),
  },
} satisfies Meta<typeof ReaderHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
