import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FeedRow } from "client/components/navigation/NavigatorPanel/FeedRow";
import { withRouter } from "stories/decorators";

const meta = {
  title: "Navigator/FeedRow",
  component: FeedRow,
  decorators: [
    withRouter,
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    subscription: { control: false },
    onSelect: { control: false },
    onClose: { control: false },
  },
  args: {
    subscription: {
      id: "feed/https://example-news.test/rss",
      title: "Example News",
      categories: [],
    },
    count: 12,
    isCurrent: false,
    selected: false,
    matchQuery: "",
    onSelect: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof FeedRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
