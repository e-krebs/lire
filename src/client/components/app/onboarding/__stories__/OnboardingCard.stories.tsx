import type { ComponentProps } from "react";
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { OnboardingCard } from "client/components/app/onboarding/OnboardingCard";
import { withUrl } from "stories/decorators";

type OnboardingSteps = ComponentProps<typeof OnboardingCard>["steps"];

const steps: OnboardingSteps = [
  { id: "language", done: false, auto: false },
  { id: "addFeed", done: false, auto: false, search: { add: true } },
  { id: "newsletter", done: false, auto: false, search: { newsletter: true } },
  { id: "folders", done: false, auto: false, search: { tab: "categories" } },
  { id: "categories", done: false, auto: false },
  { id: "markAsRead", done: false, auto: false },
  { id: "originalSite", done: false, auto: false },
  { id: "install", done: false, auto: true, canInstall: true },
];

// The card fills a result tile, so it is shown at the narrowest tile (the masonry's 360px minimum column).
const TileWidth: Decorator = (Story) => (
  <div style={{ width: 360 }}>
    <Story />
  </div>
);

const meta = {
  title: "App/Onboarding/OnboardingCard",
  component: OnboardingCard,
  decorators: [TileWidth, withUrl],
  // The See how dialog renders the reader header, which reads the stream param.
  parameters: { url: "/stream/all" },
  args: {
    steps,
    collapsed: false,
    onToggleCollapse: fn(),
    onToggleStep: fn(),
    onAction: fn(),
    dismissing: false,
    onDismissStart: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof OnboardingCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Collapsed: Story = {
  args: { collapsed: true },
};

export const AllDone: Story = {
  args: { steps: steps.map((step) => ({ ...step, done: true })) },
};
