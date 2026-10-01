import { describe, expect, it } from "vitest";
import { ApiError } from "../client";
import { queryClient } from "../queryClient";

const retry = (failureCount: number, error: Error): unknown => {
  const option = queryClient.getDefaultOptions().queries?.retry;
  if (typeof option !== "function") throw new Error("retry should be a function");
  return option(failureCount, error);
};

describe("queryClient retry", () => {
  it("never retries a sign-in or 429 error", () => {
    expect(retry(0, new ApiError({ status: 401, code: "sign_in_required" }))).toBe(false);
    expect(retry(0, new ApiError({ status: 429, code: "rate_limited" }))).toBe(false);
  });

  it("retries any other error once", () => {
    const error = new ApiError({ status: 500, code: "http" });
    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(false);
    expect(retry(0, new Error("network"))).toBe(true);
  });
});
