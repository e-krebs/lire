import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryPicker } from "../CategoryPicker";

const ui = {
  button(name: string) {
    return screen.getByRole("button", { name });
  },
  heading(name: string) {
    return screen.getByRole("heading", { name });
  },
  radio(name: string) {
    return screen.getByRole("radio", { name });
  },
  queryRadio(name: string) {
    return screen.queryByRole("radio", { name });
  },
  queryCheckbox() {
    return screen.queryByRole("checkbox");
  },
  labelText(text: string) {
    return screen.getByLabelText(text);
  },
};

const CATEGORIES = [
  { id: "a", label: "actu" },
  { id: "b", label: "blogs #dev" },
  { id: "c", label: "Must Read" },
];

describe("CategoryPicker", () => {
  it("counts the selection and offers to create a name that matches nothing", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn<(name: string) => void>();
    render(
      <CategoryPicker
        categories={CATEGORIES}
        selected={["b"]}
        onChange={() => {}}
        mode="multiple"
        onCreate={onCreate}
      />,
    );
    expect(ui.heading("Categories · 1 of 3")).toBeInTheDocument();

    await user.type(ui.labelText("Filter categories"), "ai");
    await user.click(ui.button("Create “ai”"));
    expect(onCreate).toHaveBeenCalledWith("ai");
  });

  it("picks one category in single mode and hides the excluded ones", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(selected: string[]) => void>();
    render(
      <CategoryPicker
        categories={CATEGORIES}
        selected={[]}
        onChange={onChange}
        mode="single"
        exclude={["a"]}
      />,
    );

    expect(ui.queryRadio("actu")).not.toBeInTheDocument();
    expect(ui.queryCheckbox()).not.toBeInTheDocument();
    await user.click(ui.radio("Must Read"));
    expect(onChange).toHaveBeenCalledWith(["c"]);
    expect(ui.heading("Categories · 0 of 2")).toBeInTheDocument();
  });
});
