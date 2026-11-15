import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { keys } from "client/api/keys";
import { useReconcileBehindCounts } from "../useReconcileBehindCounts";

const setup = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const client = new QueryClient();
  client.setQueryData(keys.counts, { all: 2, feeds: {}, categories: {} }, { updatedAt: 200 });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const reconcile = vi.fn<() => Promise<void>>(async () => {});
  const props = {
    enabled,
    streamKey: "all" as const,
    entries: [{ id: "1", feedId: "1", published: 0, unread: true }],
    hasNextPage: false,
    isFetching: false,
    dataUpdatedAt: 100,
    reconcile,
  };
  return { client, reconcile, props, wrapper };
};

describe("useReconcileBehindCounts", () => {
  it("reconciles when newer counts name more unread entries", async () => {
    const { props, wrapper, reconcile } = setup();
    renderHook(
      () => {
        useReconcileBehindCounts(props);
      },
      { wrapper },
    );
    await waitFor(() => {
      expect(reconcile).toHaveBeenCalledOnce();
    });
  });

  it("does not reconcile when disabled", () => {
    const { props, wrapper, reconcile } = setup({ enabled: false });
    renderHook(
      () => {
        useReconcileBehindCounts(props);
      },
      { wrapper },
    );
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("does not reconcile again for counts observed at the end of reconciliation", async () => {
    const { props, wrapper, reconcile } = setup();
    const { rerender } = renderHook(
      (options) => {
        useReconcileBehindCounts(options);
      },
      {
        wrapper,
        initialProps: props,
      },
    );
    await act(async () => {});
    expect(reconcile).toHaveBeenCalledOnce();
    rerender({ ...props, isFetching: true });
    rerender(props);
    expect(reconcile).toHaveBeenCalledOnce();
  });
});
