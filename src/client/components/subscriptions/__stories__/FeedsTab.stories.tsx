import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FeedsTab } from "client/components/subscriptions/FeedsTab";
import { COLLECTIONS, SUBSCRIPTIONS } from "stories/fixtures";

const meta = {
  title: "Subscriptions/FeedsTab",
  component: FeedsTab,
  argTypes: {
    onOpenFeed: { control: false },
    onAddWebsite: { control: false },
    onAddNewsletter: { control: false },
  },
  args: {
    subscriptions: SUBSCRIPTIONS,
    collections: COLLECTIONS,
    openFeedId: undefined,
    onOpenFeed: fn(),
    onAddWebsite: fn(),
    onAddNewsletter: fn(),
  },
} satisfies Meta<typeof FeedsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
