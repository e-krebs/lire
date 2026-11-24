import { describe, expect, it } from "vitest";
import { isStepId } from "../AddFeed/shared";

describe("isStepId", () => {
  it("accepts a step id", () => {
    expect(isStepId("name")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isStepId("done")).toBe(false);
    expect(isStepId(undefined)).toBe(false);
  });
});
