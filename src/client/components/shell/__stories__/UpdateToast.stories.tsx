import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { UpdateToast } from "client/components/shell/UpdateToast";
import { dismiss, registerPwa } from "client/utils/pwaUpdate";

type State = "hidden" | "update" | "offline";

const Harness = ({ state }: { state: State }) => {
  useEffect(() => {
    dismiss({ kind: "update" });
    dismiss({ kind: "offline" });
    registerPwa({
      register: ({ onNeedRefresh, onOfflineReady }) => {
        if (state === "update") onNeedRefresh();
        if (state === "offline") onOfflineReady();
        return async () => {};
      },
    });
  }, [state]);
  return <UpdateToast />;
};

const meta = {
  title: "Components/UpdateToast",
  component: Harness,
  parameters: { layout: "fullscreen" },
  args: { state: "update" },
  argTypes: {
    state: { control: "inline-radio", options: ["hidden", "update", "offline"] },
  },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
