import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PullIndicator } from "../PullIndicator";
import { PULL_THRESHOLD } from "client/hooks/usePullToRefresh";

const ui = {
  get queryStatus() {
    return screen.queryByRole("status");
  },
};

describe("PullIndicator", () => {
  it("renders nothing without a pull", () => {
    const { container } = render(<PullIndicator pull={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("carries the edge and the damped distance, and stays out of the tree while dragging", () => {
    const { container } = render(
      <PullIndicator
        pull={{ edge: "top", distance: 36, armed: false, refreshing: false, released: false }}
      />,
    );
    const disc = container.querySelector(".pull-indicator");
    expect(disc).toHaveAttribute("data-edge", "top");
    expect(disc).toHaveAttribute("aria-hidden", "true");
    expect(disc).not.toHaveAttribute("data-armed");
    expect(disc).toHaveStyle({ "--pull": "36px", "--pull-turn": "0.25turn" });
    expect(ui.queryStatus).not.toBeInTheDocument();
  });

  it("marks the armed state at the threshold", () => {
    const { container } = render(
      <PullIndicator
        pull={{
          edge: "bottom",
          distance: PULL_THRESHOLD,
          armed: true,
          refreshing: false,
          released: false,
        }}
      />,
    );
    const disc = container.querySelector(".pull-indicator");
    expect(disc).toHaveAttribute("data-armed");
    expect(disc).toHaveAttribute("data-edge", "bottom");
    expect(disc).toHaveStyle({ "--pull-turn": "0.5turn" });
  });

  it("announces the refresh as a status", () => {
    render(
      <PullIndicator
        pull={{ edge: "top", distance: 54, armed: true, refreshing: true, released: false }}
      />,
    );
    const disc = ui.queryStatus!;
    expect(disc).toHaveAttribute("data-refreshing");
    expect(disc).not.toHaveAttribute("aria-hidden");
    expect(disc).toHaveTextContent("Refreshing");
  });

  it("flags the slide back so the stylesheet can ease it", () => {
    const { container } = render(
      <PullIndicator
        pull={{ edge: "top", distance: 0, armed: false, refreshing: false, released: true }}
      />,
    );
    expect(container.querySelector(".pull-indicator")).toHaveAttribute("data-released");
  });
});
