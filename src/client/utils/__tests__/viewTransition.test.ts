import { describe, expect, it } from "vitest";
import { noViewTransitionRunning } from "client/utils/viewTransition";

const withActiveViewTransition = (value: unknown, run: () => void): void => {
  Object.defineProperty(document, "activeViewTransition", { configurable: true, value });
  try {
    run();
  } finally {
    delete (document as { activeViewTransition?: unknown }).activeViewTransition;
  }
};

describe("noViewTransitionRunning", () => {
  it("returns true when the property is absent", () => {
    expect(noViewTransitionRunning()).toBe(true);
  });

  it("returns true when set to null", () => {
    withActiveViewTransition(null, () => {
      expect(noViewTransitionRunning()).toBe(true);
    });
  });

  it("returns false when set to an object", () => {
    withActiveViewTransition({}, () => {
      expect(noViewTransitionRunning()).toBe(false);
    });
  });
});
