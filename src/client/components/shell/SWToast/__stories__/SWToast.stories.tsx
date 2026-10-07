import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountMenu } from "client/components/shell/AccountMenu";
import { SWToast } from "client/components/shell/SWToast";
import { registerPwa } from "client/utils/pwaUpdate";
import { withQueryClient, withRouter } from "stories/decorators";

type State = "hidden" | "update" | "offline";
type Bar = "top" | "bottom";

const Harness = ({ state, bar }: { state: State; bar: Bar }) => {
  useEffect(() => {
    registerPwa({
      register: ({ onNeedRefresh, onOfflineReady }) => {
        if (state === "update") onNeedRefresh();
        if (state === "offline") onOfflineReady();
        return async () => {};
      },
    });
  }, [state, bar]);
  // The flight reads the bar position from <html>, as the app sets it.
  useEffect(() => {
    document.documentElement.dataset.bar = bar;
    return () => {
      delete document.documentElement.dataset.bar;
    };
  }, [bar]);
  return (
    <>
      <div className={`fixed right-2 ${bar === "top" ? "top-2" : "bottom-2"}`}>
        <AccountMenu />
      </div>
      <SWToast key={`${state}-${bar}`} />
    </>
  );
};

const meta = {
  title: "Components/SWToast",
  component: Harness,
  decorators: [withRouter, withQueryClient],
  parameters: { layout: "fullscreen" },
  args: { state: "update", bar: "top" },
  argTypes: {
    state: { control: "inline-radio", options: ["hidden", "update", "offline"] },
    bar: { control: "inline-radio", options: ["top", "bottom"] },
  },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
