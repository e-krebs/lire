import { describe, expect, it } from "vitest";
import { furthestStep, stepStatuses } from "../steps";

const ids = ["find", "name", "categories"] as const;

describe("steps", () => {
  describe("when computing statuses", () => {
    it("marks the steps before the current one as done and the ones after as todo", () => {
      expect(stepStatuses({ ids, current: "name" })).toEqual([
        { id: "find", status: "done" },
        { id: "name", status: "current" },
        { id: "categories", status: "todo" },
      ]);
    });

    it("marks every step todo but the first when the first is current", () => {
      expect(stepStatuses({ ids, current: "find" }).map((step) => step.status)).toEqual([
        "current",
        "todo",
        "todo",
      ]);
    });
  });

  describe("when finding the furthest step", () => {
    it("stays on the first step when it is not complete", () => {
      expect(furthestStep({ ids, complete: () => false })).toBe("find");
    });

    it("when the first steps are complete, reaches the step after the last complete one", () => {
      expect(furthestStep({ ids, complete: (id) => id === "find" })).toBe("name");
      expect(furthestStep({ ids, complete: (id) => id !== "categories" })).toBe("categories");
    });

    it("when a step is incomplete, does not skip past it", () => {
      expect(furthestStep({ ids, complete: (id) => id === "name" })).toBe("find");
    });
  });
});
