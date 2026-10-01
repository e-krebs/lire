import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { DemoBanner } from "client/components/shell/DemoBanner";

const logReset = action("reset blocked");

const meta = {
  title: "Components/DemoBanner",
  component: DemoBanner,
  parameters: { layout: "fullscreen" },
  decorators: [
    // Reset ends in `location.assign("/")`, which would load Storybook inside its own preview.
    (Story) => (
      <div
        onClickCapture={(event) => {
          event.stopPropagation();
          logReset();
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DemoBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
