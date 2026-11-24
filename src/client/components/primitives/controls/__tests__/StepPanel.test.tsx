import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepPanel } from "../StepPanel";

const ui = {
  text(content: string) {
    return screen.getByText(content);
  },
  maybeText(content: string) {
    return screen.queryByText(content);
  },
};

const stubMotion = ({ allowed }: { allowed: boolean }) => {
  vi.stubGlobal("matchMedia", () => ({ matches: allowed }));
};

describe("StepPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not animate the first step", () => {
    render(<StepPanel index={0}>content</StepPanel>);
    expect(ui.text("content")).not.toHaveClass("step-enter-forward", "step-enter-back");
  });

  it("slides in from the right when the index grows", () => {
    const { rerender } = render(<StepPanel index={0}>content</StepPanel>);
    rerender(<StepPanel index={1}>content</StepPanel>);
    expect(ui.text("content")).toHaveClass("step-enter-forward");
  });

  it("slides in from the left when the index shrinks", () => {
    const { rerender } = render(<StepPanel index={2}>content</StepPanel>);
    rerender(<StepPanel index={1}>content</StepPanel>);
    expect(ui.text("content")).toHaveClass("step-enter-back");
  });

  it("mounts a new element on each step so the animation restarts", () => {
    const { rerender } = render(<StepPanel index={0}>content</StepPanel>);
    const first = ui.text("content");
    rerender(<StepPanel index={1}>content</StepPanel>);
    expect(ui.text("content")).not.toBe(first);
  });

  it("keeps the old step as an inert copy during the exit", () => {
    vi.useFakeTimers();
    stubMotion({ allowed: true });
    const { rerender } = render(<StepPanel index={0}>old</StepPanel>);
    rerender(<StepPanel index={1}>new</StepPanel>);
    expect(ui.text("old")).toHaveAttribute("inert");
    expect(ui.text("old")).toHaveAttribute("aria-hidden", "true");
  });

  it("removes the old step once the exit ends", () => {
    vi.useFakeTimers();
    stubMotion({ allowed: true });
    const { rerender } = render(<StepPanel index={0}>old</StepPanel>);
    rerender(<StepPanel index={1}>new</StepPanel>);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(ui.maybeText("old")).toBeNull();
  });

  it("keeps no old step under reduced motion", () => {
    stubMotion({ allowed: false });
    const { rerender } = render(<StepPanel index={0}>old</StepPanel>);
    rerender(<StepPanel index={1}>new</StepPanel>);
    expect(ui.maybeText("old")).toBeNull();
  });
});
