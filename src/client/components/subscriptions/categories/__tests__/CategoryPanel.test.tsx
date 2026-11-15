import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Category } from "shared/feedsApi/types";
import { CategoryNameForm } from "../CategoryPanel";

type CategoryRename = Parameters<typeof CategoryNameForm>[0]["rename"];

const CATEGORIES: Category[] = [
  { id: "a", label: "actu", feedIds: [] },
  { id: "blogs", label: "Blogs", feedIds: [] },
];

const ui = {
  get input() {
    return screen.getByLabelText("Name");
  },
  get save() {
    return screen.getByRole("button", { name: "Save" });
  },
  get alert() {
    return screen.getByRole("alert");
  },
  get queryAlert() {
    return screen.queryByRole("alert");
  },
};

const setup = () => {
  const rename = {
    mutate: vi.fn<CategoryRename["mutate"]>(),
    isError: false,
    error: null,
  } satisfies CategoryRename;
  render(
    <>
      <CategoryNameForm
        formId="rename"
        category={CATEGORIES[0]}
        categories={CATEGORIES}
        rename={rename}
        onSaved={() => {}}
      />
      <button type="submit" form="rename">
        Save
      </button>
    </>,
  );
  return { rename };
};

describe("CategoryNameForm", () => {
  it("flags an empty name and clears the flag on typing", async () => {
    const user = userEvent.setup();
    const { rename } = setup();

    await user.clear(ui.input);
    await user.click(ui.save);
    expect(ui.alert).toHaveTextContent("Enter a name for this category.");
    expect(ui.input).toHaveAttribute("aria-invalid", "true");
    expect(rename.mutate).not.toHaveBeenCalled();

    await user.type(ui.input, "x");
    expect(ui.queryAlert).not.toBeInTheDocument();
    expect(ui.input).not.toHaveAttribute("aria-invalid");
  });

  it("flags a name already used by another category", async () => {
    const user = userEvent.setup();
    const { rename } = setup();

    await user.clear(ui.input);
    await user.type(ui.input, "blogs");
    await user.click(ui.save);
    expect(ui.alert).toHaveTextContent("A category with this name already exists.");
    expect(ui.input).toHaveAttribute("aria-invalid", "true");
    expect(rename.mutate).not.toHaveBeenCalled();
  });
});
