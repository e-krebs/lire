import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CategoryResultRow } from "client/components/navigation/NavigatorPanel/CategoryResultRow";
import { withRouter } from "stories/decorators";

const meta = {
  title: "Navigator/CategoryResultRow",
  component: CategoryResultRow,
  decorators: [
    withRouter,
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    collection: { control: false },
    onSelect: { control: false },
    onClose: { control: false },
  },
  args: {
    collection: { id: "user/1/category/tech", label: "Technology", feeds: [] },
    count: 24,
    isCurrent: false,
    selected: false,
    matchQuery: "tech",
    onSelect: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof CategoryResultRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
