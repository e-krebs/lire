import type { Meta, StoryObj } from "@storybook/react-vite";
import { RouteNotFound } from "client/components/app/notices/RouteNotFound";
import { withRouter } from "stories/decorators";

const meta = {
  title: "App/Notices/RouteNotFound",
  component: RouteNotFound,
  decorators: [withRouter],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RouteNotFound>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
