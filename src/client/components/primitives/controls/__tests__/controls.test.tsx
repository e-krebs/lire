import { useState } from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChipSet } from "../ChipSet";
import { Tabs } from "../Tabs";

const ui = {
  text(content: string) {
    return screen.getByText(content);
  },
  tab(name: string) {
    return screen.getByRole("tab", { name });
  },
};

// 10px a character, in a row `available` wide.
const layoutChips = (available: number): void => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent.length * 10;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return available;
    },
  });
};

const fitChips = ({ labels, available }: { labels: string[]; available: number }) => {
  layoutChips(available);
  const { container, unmount } = render(<ChipSet labels={labels} />);
  const shown = Array.from(container.querySelectorAll("[data-tip-overflow]"), (chip) =>
    chip.getAttribute("data-tip"),
  );
  const more = container.querySelector("[data-tip]:not([data-tip-overflow]) > [aria-hidden]");
  const result = { shown, more: more?.textContent ?? null };
  unmount();
  return result;
};

describe("controls", () => {
  it("moves the selection with the arrow keys", async () => {
    const user = userEvent.setup();
    const Harness = () => {
      const [selected, setSelected] = useState<"categories" | "feeds">("categories");
      return (
        <Tabs
          label="Subscriptions"
          tabs={[
            { id: "categories", label: "Categories", count: 20 },
            { id: "feeds", label: "Feeds", count: 164 },
          ]}
          selected={selected}
          onSelect={setSelected}
        />
      );
    };
    render(<Harness />);

    await user.click(ui.tab("Categories · 20"));
    await user.keyboard("{ArrowRight}");
    const feeds = ui.tab("Feeds · 164");
    expect(feeds).toHaveAttribute("aria-selected", "true");
    expect(feeds).toHaveFocus();
  });

  it("fits what it can and folds the rest into one +N chip", () => {
    expect(fitChips({ labels: ["aaaaa", "bbbbb"], available: 200 })).toEqual({
      shown: ["aaaaa", "bbbbb"],
      more: null,
    });
    expect(fitChips({ labels: ["aaaaa", "bbbbb", "ccccccc", "ddddd"], available: 150 })).toEqual({
      shown: ["aaaaa", "bbbbb"],
      more: "+2",
    });
    expect(fitChips({ labels: ["a".repeat(30), "bbbbb"], available: 150 })).toEqual({
      shown: ["a".repeat(30)],
      more: "+1",
    });
  });

  it("lists every hidden label in the +N chip's tooltip", () => {
    layoutChips(150);

    const { container } = render(<ChipSet labels={["alpha", "bravo", "charlie", "delta"]} />);

    const more = ui.text("+2").parentElement;
    expect(more).toHaveAttribute("data-tip", "charlie, delta");
    const shown = Array.from(container.querySelectorAll("[data-tip-overflow]"), (chip) =>
      chip.getAttribute("data-tip"),
    );
    expect(shown).toEqual(["alpha", "bravo"]);
  });
});
