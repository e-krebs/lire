import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { Stepper } from "client/components/primitives/controls/Stepper";
import { StepPanel } from "client/components/primitives/controls/StepPanel";

const buttonClassName =
  "min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold text-ink disabled:opacity-50";

const meta = {
  title: "Primitives/Controls/Stepper",
  component: Stepper<string>,
  args: {
    label: "Add a feed",
    current: "name",
    countLabel: ({ current, total }) => `Step ${current} of ${total}`,
    statusLabels: { done: "completed", todo: "not completed" },
    onSelect: fn(),
    steps: [
      { id: "find", label: "Find" },
      { id: "name", label: "Name and preview" },
      { id: "categories", label: "Categories" },
    ],
  },
  argTypes: {
    onSelect: { control: false },
    steps: { control: false },
    label: { control: false },
  },
  render: function Render(args) {
    const [current, setCurrent] = useState(args.current);
    const index = args.steps.findIndex((step) => step.id === current);
    const go = (offset: number) => {
      const next = args.steps.at(index + offset);
      if (next) {
        setCurrent(next.id);
        args.onSelect(next.id);
      }
    };
    return (
      <div className="flex w-[min(30rem,calc(100vw-2rem))] flex-col gap-4">
        <Stepper
          {...args}
          current={current}
          onSelect={(next) => {
            setCurrent(next);
            args.onSelect(next);
          }}
        />
        <StepPanel
          index={index}
          className="grid min-h-32 place-items-center rounded-xl bg-surface-2 text-sm"
        >
          Content of {args.steps[index]?.label}
        </StepPanel>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClassName}
            disabled={index <= 0}
            onClick={() => {
              go(-1);
            }}
          >
            Previous
          </button>
          <button
            type="button"
            className={buttonClassName}
            disabled={index >= args.steps.length - 1}
            onClick={() => {
              go(1);
            }}
          >
            Next
          </button>
        </div>
      </div>
    );
  },
} satisfies Meta<typeof Stepper<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const find = canvas.getByRole("button", { name: /Find/ });
    await expect(canvas.getByText("Name and preview").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "step",
    );
    await userEvent.click(find);
    await expect(args.onSelect).toHaveBeenCalledWith("find");
    await expect(canvas.getByText("Find").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "step",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(args.onSelect).toHaveBeenLastCalledWith("name");
    await userEvent.click(canvas.getByRole("button", { name: "Previous" }));
    await expect(args.onSelect).toHaveBeenLastCalledWith("find");
  },
};
