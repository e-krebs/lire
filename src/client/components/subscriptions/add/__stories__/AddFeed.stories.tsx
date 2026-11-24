import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";
import { resetFixtureState } from "client/api/adapters/fixture";
import { AddFeed } from "client/components/subscriptions/add/AddFeed";
import type { StepId } from "client/components/subscriptions/add/AddFeed/shared";
import { withQueryClient } from "stories/decorators";
import { CATEGORIES } from "stories/fixtures";

const SLOW = { timeout: 10_000 };

const meta = {
  title: "Subscriptions/Add/AddFeed",
  component: AddFeed,
  decorators: [withQueryClient],
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    resetFixtureState();
  },
  render: function Render(args) {
    const [step, setStep] = useState<StepId>(args.step);
    return (
      <AddFeed
        {...args}
        step={step}
        onStepChange={(change) => {
          setStep(change.step);
          args.onStepChange(change);
        }}
      />
    );
  },
  argTypes: { onStepChange: { control: false }, onDone: { control: false } },
  args: {
    categories: CATEGORIES,
    categoryId: undefined,
    step: "find",
    onStepChange: fn(),
    onDone: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof AddFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Subscribe: Story = {
  play: async ({ args }) => {
    await userEvent.type(
      await screen.findByRole("textbox", { name: "Feed or site URL" }),
      "tech.example.test",
    );
    await userEvent.click(await screen.findByRole("radio", { name: /Example Tech Daily/ }, SLOW));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(await screen.findByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Tech" }));
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    await waitFor(async () => {
      await expect(args.onDone).toHaveBeenCalledOnce();
    }, SLOW);
  },
};

export const MakeWebFeed: Story = {
  play: async ({ args }) => {
    await userEvent.type(
      await screen.findByRole("textbox", { name: "Feed or site URL" }),
      "https://changelog.example.test/releases",
    );
    await userEvent.click(await screen.findByRole("button", { name: "Make a web feed" }, SLOW));
    await userEvent.click(await screen.findByRole("radio", { name: /Sidebar links/ }, SLOW));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Tech" }));
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    await waitFor(async () => {
      await expect(args.onDone).toHaveBeenCalledOnce();
    }, SLOW);
  },
};

export const Cancel: Story = {
  play: async ({ args }) => {
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await expect(args.onCancel).toHaveBeenCalledOnce();
  },
};
