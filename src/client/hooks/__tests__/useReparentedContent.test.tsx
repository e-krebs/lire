import { useState } from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useReparentedContent } from "../useReparentedContent";

const Counter = () => {
  const [count, setCount] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        setCount(count + 1);
      }}
    >
      {`count ${count}`}
    </button>
  );
};

const Frame = ({ wrapper, shown = true }: { wrapper: "section" | "article"; shown?: boolean }) => {
  const { portal, slot } = useReparentedContent(shown ? <Counter /> : null);
  const Wrapper = wrapper;
  return (
    <>
      <Wrapper data-testid="wrapper">{slot}</Wrapper>
      {portal}
    </>
  );
};

const ui = {
  get wrapper() {
    return screen.getByTestId("wrapper");
  },
  counter(count: number) {
    return screen.getByRole("button", { name: `count ${count}` });
  },
};

describe("useReparentedContent", () => {
  it("keeps the content's state when the slot moves to another parent", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Frame wrapper="section" />);
    await user.click(ui.counter(0));

    rerender(<Frame wrapper="article" />);

    expect(ui.wrapper.tagName).toBe("ARTICLE");
    expect(ui.wrapper).toContainElement(ui.counter(1));
  });

  it("renders no slot without content", () => {
    render(<Frame wrapper="section" shown={false} />);

    expect(ui.wrapper).toBeEmptyDOMElement();
  });
});
