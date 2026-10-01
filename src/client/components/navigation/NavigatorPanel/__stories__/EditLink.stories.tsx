import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EditLink } from "client/components/navigation/NavigatorPanel/EditLink";
import { withRouter } from "stories/decorators";

interface Args {
  kind: "feed" | "category";
  targetId: string;
  title: string;
  visible: boolean;
  onClose: () => void;
}

const meta: Meta<Args> = {
  title: "Navigator/EditLink",
  decorators: [withRouter],
  argTypes: {
    kind: { control: "inline-radio", options: ["feed", "category"] },
    onClose: { control: false },
  },
  args: {
    kind: "category",
    targetId: "user/1/category/tech",
    title: "Technology",
    visible: true,
    onClose: fn(),
  },
  render: ({ kind, targetId, title, visible, onClose }) => (
    // The link fades in with its row's hover or selection.
    <div
      data-selected={visible || undefined}
      className="group relative h-10 w-64 rounded-lg bg-surface-2"
    >
      <EditLink
        target={kind === "feed" ? { kind, feedId: targetId } : { kind, categoryId: targetId }}
        title={title}
        onClose={onClose}
      />
    </div>
  ),
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};
