import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  dismissWriteFailure,
  reportWriteFailure,
  useWriteFailure,
} from "client/utils/writeFailure";

describe("writeFailure", () => {
  afterEach(() => {
    dismissWriteFailure();
  });

  it("raises failureId on a report", () => {
    const { result } = renderHook(() => useWriteFailure());

    act(() => {
      reportWriteFailure();
    });

    expect(result.current.failureId).toBe(1);
  });

  it("raises failureId again on a second report", () => {
    const { result } = renderHook(() => useWriteFailure());

    act(() => {
      reportWriteFailure();
      reportWriteFailure();
    });

    expect(result.current.failureId).toBe(2);
  });

  it("returns failureId to 0 on dismiss", () => {
    const { result } = renderHook(() => useWriteFailure());
    act(() => {
      reportWriteFailure();
    });

    act(() => {
      dismissWriteFailure();
    });

    expect(result.current.failureId).toBe(0);
  });

  it("notifies every subscribed hook on a report and on a dismiss", () => {
    const first = renderHook(() => useWriteFailure());
    const second = renderHook(() => useWriteFailure());

    act(() => {
      reportWriteFailure();
    });
    expect(first.result.current.failureId).toBe(1);
    expect(second.result.current.failureId).toBe(1);

    act(() => {
      dismissWriteFailure();
    });
    expect(first.result.current.failureId).toBe(0);
    expect(second.result.current.failureId).toBe(0);
  });
});
