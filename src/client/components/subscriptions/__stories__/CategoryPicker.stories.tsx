import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import { CategoryPicker } from "client/components/subscriptions/CategoryPicker";

const IDS = ["tech", "news", "design", "science"];

const meta = {
  title: "Subscriptions/CategoryPicker",
  component: CategoryPicker,
  argTypes: {
    mode: { control: "inline-radio" },
    exclude: { control: "multi-select", options: IDS },
    selected: { control: "multi-select", options: IDS },
  },
  args: {
    mode: "multiple",
    exclude: [],
    selected: ["tech"],
    categories: [
      { id: "tech", label: "Tech" },
      { id: "news", label: "News" },
      { id: "design", label: "Design" },
      { id: "science", label: "Science" },
    ],
    onCreate: fn(),
    onChange: fn(),
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <CategoryPicker
        {...args}
        onChange={(selected) => {
          updateArgs({ selected });
        }}
      />
    );
  },
} satisfies Meta<typeof CategoryPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    mode: "single",
  },
};
