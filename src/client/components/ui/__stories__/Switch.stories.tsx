import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import { Switch } from "client/components/ui/Switch";

const meta = {
  title: "Components/Switch",
  component: Switch,
  argTypes: { children: { control: false } },
  args: { checked: false, onChange: fn(), children: "Open articles directly" },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <Switch
        {...args}
        onChange={(checked) => {
          updateArgs({ checked });
        }}
      />
    );
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "aaaa",
  },
};
