import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WriteFailureToast } from "client/components/app/notices/WriteFailureToast";
import { dismissWriteFailure, reportWriteFailure } from "client/utils/writeFailure";
import { withQueryClient, withRouter } from "stories/decorators";

type State = "hidden" | "failed";

const Harness = ({ state }: { state: State }) => {
  useEffect(() => {
    if (state !== "failed") return undefined;
    reportWriteFailure();
    return () => {
      dismissWriteFailure();
    };
  }, [state]);
  return <WriteFailureToast />;
};

const meta = {
  title: "App/Notices/WriteFailureToast",
  component: Harness,
  decorators: [withRouter, withQueryClient],
  parameters: { layout: "fullscreen" },
  args: { state: "failed" },
  argTypes: {
    state: { control: "inline-radio", options: ["hidden", "failed"] },
  },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
