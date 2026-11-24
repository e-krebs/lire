import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepPanel } from "client/components/primitives/controls/StepPanel";
import { useStepFocus } from "../useStepFocus";

const Flow = ({ step }: { step: "find" | "name" }) => {
  const heading = useStepFocus({ step });
  return (
    <h2 ref={heading} tabIndex={-1}>
      {step}
    </h2>
  );
};

const ui = {
  heading(name: string) {
    return screen.getByRole("heading", { name });
  },
};

describe("useStepFocus", () => {
  it("does not take focus on mount", () => {
    render(<Flow step="find" />);
    expect(ui.heading("find")).not.toHaveFocus();
  });

  it("does not take focus on mount in StrictMode", () => {
    render(
      <StrictMode>
        <Flow step="find" />
      </StrictMode>,
    );
    expect(ui.heading("find")).not.toHaveFocus();
  });

  it("focuses the heading when the step changes", () => {
    const { rerender } = render(<Flow step="find" />);
    rerender(<Flow step="name" />);
    expect(ui.heading("name")).toHaveFocus();
  });

  describe("when inside a StepPanel", () => {
    const Panel = ({ step }: { step: "find" | "name" }) => {
      const heading = useStepFocus({ step });
      return (
        <StepPanel index={step === "find" ? 0 : 1}>
          <h2 ref={heading} tabIndex={-1}>
            {step}
          </h2>
        </StepPanel>
      );
    };

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("focuses the new heading, not the exiting copy", () => {
      vi.stubGlobal("matchMedia", () => ({ matches: true }));
      const { rerender } = render(<Panel step="find" />);
      rerender(<Panel step="name" />);
      expect(ui.heading("name")).toHaveFocus();
    });
  });
});
