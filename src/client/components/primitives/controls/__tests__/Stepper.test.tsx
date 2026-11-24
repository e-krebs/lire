import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "../Stepper";

const steps = [
  { id: "find", label: "Find" },
  { id: "name", label: "Name" },
  { id: "categories", label: "Categories" },
] as const;

const renderStepper = ({ current = "name", onSelect = vi.fn<(id: string) => void>() } = {}) =>
  render(
    <Stepper
      label="Add a feed"
      steps={steps}
      current={current}
      countLabel={({ current, total }) => `Step ${current} of ${total}`}
      statusLabels={{ done: "completed", todo: "not completed" }}
      onSelect={onSelect}
    />,
  );

const ui = {
  list() {
    return screen.getByRole("navigation", { name: "Add a feed" });
  },
  button(name: RegExp) {
    return within(ui.list()).getByRole("button", { name });
  },
  buttons() {
    return within(ui.list()).queryAllByRole("button");
  },
  text(content: string) {
    return screen.getByText(content);
  },
  hidden(content: string) {
    return within(ui.list()).getByText(content);
  },
  currentItems() {
    return document.querySelectorAll('[aria-current="step"]');
  },
};

describe("Stepper", () => {
  it("marks exactly one step as the current step", () => {
    renderStepper();
    expect(ui.currentItems()).toHaveLength(1);
    expect(ui.currentItems()[0]).toHaveTextContent("Name");
  });

  it("does not make the current step a button", () => {
    renderStepper();
    expect(ui.currentItems()[0]?.closest("button")).toBeNull();
    expect(ui.buttons()).toHaveLength(1);
  });

  it("has no done buttons on the first step", () => {
    renderStepper({ current: "find" });
    expect(ui.buttons()).toHaveLength(0);
  });

  it("has two done buttons on the last step", () => {
    renderStepper({ current: "categories" });
    expect(ui.buttons()).toHaveLength(2);
  });

  it("shows the count line", () => {
    renderStepper();
    expect(ui.text("Step 2 of 3")).toBeInTheDocument();
  });

  it("names the step list and reads the hidden state of done and todo steps", () => {
    renderStepper();
    expect(ui.button(/Find completed/)).toBeInTheDocument();
    expect(ui.hidden("not completed")).toBeInTheDocument();
  });

  it("makes done steps buttons and leaves todo steps unclickable", () => {
    renderStepper();
    expect(ui.button(/Find/)).toBeInstanceOf(HTMLButtonElement);
    expect(ui.text("Categories").closest("button")).toBeNull();
  });

  it("selects a done step", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn<(id: string) => void>();
    renderStepper({ onSelect });
    await user.click(ui.button(/Find/));
    expect(onSelect).toHaveBeenCalledWith("find");
  });

  it("does not select a todo step", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn<(id: string) => void>();
    renderStepper({ onSelect });
    await user.click(ui.text("Categories"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
