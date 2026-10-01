import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SearchResultRow } from "client/components/navigation/NavigatorPanel/SearchResultRow";

const meta = {
  title: "Navigator/SearchResultRow",
  component: SearchResultRow,
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  argTypes: { onSelect: { control: false } },
  args: { query: "calm software", scopeLabel: "All articles", selected: false, onSelect: fn() },
} satisfies Meta<typeof SearchResultRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
