import { act } from "@testing-library/react";
import { vi } from "vitest";

export const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
