import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CategoryTreeRow } from "client/components/navigation/NavigatorPanel/CategoryTreeRow";
import { withRouter } from "stories/decorators";

const meta = {
  title: "Navigator/CategoryTreeRow",
  component: CategoryTreeRow,
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
    onToggleCollapse: { control: false },
    onSelect: { control: false },
    onClose: { control: false },
  },
  args: {
    collection: { id: "user/1/category/tech", label: "Technology" },
    count: 24,
    isCurrent: false,
    collapsed: true,
    expandable: true,
    selected: false,
    onToggleCollapse: fn(),
    onSelect: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof CategoryTreeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
