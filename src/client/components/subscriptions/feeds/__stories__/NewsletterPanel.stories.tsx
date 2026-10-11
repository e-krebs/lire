import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { resetFixtureState } from "client/api/adapters/fixture";
import { NewsletterPanel } from "client/components/subscriptions/feeds/NewsletterPanel";
import { withQueryClient } from "stories/decorators";

const meta = {
  title: "Subscriptions/Feeds/NewsletterPanel",
  component: NewsletterPanel,
  decorators: [withQueryClient],
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    resetFixtureState();
  },
  argTypes: { onClose: { control: false } },
  args: { onClose: fn() },
} satisfies Meta<typeof NewsletterPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
