import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissWriteFailure, useWriteFailure } from "client/utils/writeFailure";
import { ApiError } from "../client";
import { queryClient } from "../queryClient";

const retry = (failureCount: number, error: Error): unknown => {
  const fn = queryClient.getDefaultOptions().queries?.retry;
  if (typeof fn !== "function") throw new Error("retry should be a function");
  return fn(failureCount, error);
};

const retryDelay = (failureCount: number, error: Error): number => {
  const fn = queryClient.getDefaultOptions().queries?.retryDelay;
  if (typeof fn !== "function") throw new Error("retryDelay should be a function");
  return fn(failureCount, error);
};

describe("queryClient", () => {
  describe("when a read fails", () => {
    it("never retries a sign-in error", () => {
      expect(retry(0, new ApiError({ status: 401, code: "sign_in_required" }))).toBe(false);
    });

    it("retries a 429 twice", () => {
      const error = new ApiError({ status: 429, code: "rate_limited", retryAfter: 60 });
      expect(retry(0, error)).toBe(true);
      expect(retry(1, error)).toBe(true);
      expect(retry(2, error)).toBe(false);
    });

    it("retries any other error once", () => {
      const error = new ApiError({ status: 500, code: "http" });
      expect(retry(0, error)).toBe(true);
      expect(retry(1, error)).toBe(false);
      expect(retry(0, new Error("network"))).toBe(true);
    });
  });

  describe("when waiting before a retry", () => {
    it("waits retryAfter seconds for a 429", () => {
      expect(
        retryDelay(1, new ApiError({ status: 429, code: "rate_limited", retryAfter: 30 })),
      ).toBe(30_000);
    });

    it("caps a 429 wait at two minutes", () => {
      expect(
        retryDelay(1, new ApiError({ status: 429, code: "rate_limited", retryAfter: 900 })),
      ).toBe(120_000);
    });

    it("falls back to 60 seconds for a 429 with no retryAfter", () => {
      expect(retryDelay(1, new ApiError({ status: 429, code: "rate_limited" }))).toBe(60_000);
    });

    it("keeps the TanStack default delay for other errors", () => {
      const error = new ApiError({ status: 500, code: "http" });
      expect(retryDelay(1, error)).toBe(2_000);
      expect(retryDelay(2, error)).toBe(4_000);
      expect(retryDelay(10, error)).toBe(30_000);
    });
  });

  describe("when a read is rate limited", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("re-runs a 429 read twice, each after retryAfter", async () => {
      const client = new QueryClient({ defaultOptions: queryClient.getDefaultOptions() });
      const queryFn = vi.fn<() => never>(() => {
        throw new ApiError({ status: 429, code: "rate_limited", retryAfter: 5 });
      });

      const settled = client
        .query({ queryKey: ["rate-limited"], queryFn })
        .catch((caught: unknown) => caught);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(queryFn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(queryFn).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(queryFn).toHaveBeenCalledTimes(3);

      await expect(settled).resolves.toMatchObject({ status: 429, code: "rate_limited" });
      expect(queryFn).toHaveBeenCalledTimes(3);
    });
  });

  describe("when a write fails", () => {
    afterEach(() => {
      dismissWriteFailure();
    });

    const runMutation = async ({
      meta,
      succeeds,
    }: {
      meta?: { notifyOnFailure?: boolean };
      succeeds: boolean;
    }) => {
      const mutation = queryClient.getMutationCache().build(queryClient, {
        mutationFn: async () => {
          await Promise.resolve();
          if (!succeeds) throw new Error("boom");
          return "ok";
        },
        meta,
      });
      await act(async () => {
        await mutation.execute(undefined).catch(() => undefined);
      });
    };

    it("reports once when a tagged mutation fails", async () => {
      const failures = renderHook(() => useWriteFailure());

      await runMutation({ meta: { notifyOnFailure: true }, succeeds: false });

      expect(failures.result.current.failureId).toBe(1);
    });

    it("does not report an untagged mutation that fails", async () => {
      const failures = renderHook(() => useWriteFailure());

      await runMutation({ succeeds: false });

      expect(failures.result.current.failureId).toBe(0);
    });

    it("does not report a tagged mutation that succeeds", async () => {
      const failures = renderHook(() => useWriteFailure());

      await runMutation({ meta: { notifyOnFailure: true }, succeeds: true });

      expect(failures.result.current.failureId).toBe(0);
    });
  });
});
