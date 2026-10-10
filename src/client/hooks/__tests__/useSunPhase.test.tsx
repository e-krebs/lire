import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useSunPhase } from "../useSunPhase";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("useSunPhase", () => {
  it("answers undefined for a zone with no coordinates", async () => {
    const { result } = renderHook(() => useSunPhase({ tz: "UTC" }), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current).toEqual({ phase: undefined, pending: false });
  });

  it("answers a phase for a zone with coordinates", async () => {
    const { result } = renderHook(() => useSunPhase({ tz: "Europe/Paris" }), { wrapper });
    await waitFor(() => {
      expect(["day", "dusk"]).toContain(result.current.phase);
    });
  });
});
