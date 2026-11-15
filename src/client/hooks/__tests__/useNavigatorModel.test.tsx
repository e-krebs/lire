import { createContext, useContext } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { keys } from "client/api/keys";
import {
  NO_ROW,
  SUBSCRIPTIONS_ROW_KEY,
  categoryRowKey,
  feedRowKey,
} from "client/components/browse-menu/rows/shared";
import { feedStreamKey, useNavigatorModel } from "client/hooks/useNavigatorModel";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";
import { seedCategoryId, seedCategoryKey } from "test/seedCategories";

type Props = Parameters<typeof useNavigatorModel>[0];

const TECH_ID = seedCategoryId("Tech");
const FEED_ID = "101";

const HookSlot = createContext<ReactNode>(null);
const Slot = () => <>{useContext(HookSlot)}</>;

// The hook reads only `key` and `preventDefault` from the event.
const keyEvent = (key: string) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only key and preventDefault are read
  ({ key, preventDefault: () => {} }) as KeyboardEvent<HTMLInputElement>;

const setup = async ({
  streamKey = "all",
  query = "",
  open = true,
  holdFeeds = false,
}: {
  streamKey?: string;
  query?: string;
  open?: boolean;
  holdFeeds?: boolean;
} = {}) => {
  vi.stubEnv("VITE_API_MODE", "real");
  server.use(fixtureBackend);
  let release = (): void => {};
  if (holdFeeds) {
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/feeds", async () => {
        await held;
      }),
    );
  }
  resetFixtureState();

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      // The hook reads the matched route, so it mounts inside the stream route, not beside it.
      createRoute({ getParentRoute: () => rootRoute, path: "/stream/$streamKey", component: Slot }),
      createRoute({ getParentRoute: () => rootRoute, path: "/subscriptions" }),
    ]),
    history: createMemoryHistory({ initialEntries: [`/stream/${encodeURIComponent(streamKey)}`] }),
  });
  await router.load();

  const onQueryChange = vi.fn<(value: string) => void>();
  const onClose = vi.fn<() => void>();
  const base = { query, onQueryChange, onClose, scopeKey: streamKey };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <HookSlot.Provider value={children}>
        <RouterProvider router={router} />
      </HookSlot.Provider>
    </QueryClientProvider>
  );
  const { result, rerender } = renderHook((props: Props) => useNavigatorModel(props), {
    initialProps: { ...base, open },
    wrapper,
  });

  if (!holdFeeds) {
    await waitFor(() => {
      expect(result.current.categoriesReady).toBe(true);
      expect(client.getQueryState(keys.feeds)?.status).toBe("success");
    });
  }

  const setOpen = (next: boolean): void => {
    rerender({ ...base, open: next });
  };
  const press = (key: string): void => {
    act(() => {
      result.current.handleKeyDown(keyEvent(key));
    });
  };
  const selectRow = (key: string): void => {
    for (let step = 0; step < 100 && result.current.selectedBrowseKey !== key; step++) {
      press("ArrowDown");
    }
  };

  return { result, client, router, onQueryChange, onClose, setOpen, press, selectRow, release };
};

describe("useNavigatorModel", () => {
  it("starts with no row highlighted when the query is empty", async () => {
    const { result } = await setup();

    expect(result.current.selectedIndex).toBe(NO_ROW);
  });

  it("starts on the top row when the query is typed", async () => {
    const { result } = await setup({ query: "tech" });

    expect(result.current.selectedIndex).toBe(0);
  });

  it("moves with ArrowDown and ArrowUp, stopping at both ends", async () => {
    const { result, press } = await setup();

    press("ArrowDown");
    expect(result.current.selectedIndex).toBe(0);
    press("ArrowUp");
    expect(result.current.selectedIndex).toBe(0);

    for (let step = 0; step < 100; step++) press("ArrowDown");
    expect(result.current.selectedBrowseKey).toBe(SUBSCRIPTIONS_ROW_KEY);
    const last = result.current.selectedIndex;
    press("ArrowDown");
    expect(result.current.selectedIndex).toBe(last);
  });

  it("opens a group on ArrowRight, steps into it, and closes it from a feed with ArrowLeft", async () => {
    const { result, press, selectRow } = await setup();

    selectRow(categoryRowKey(TECH_ID));
    press("ArrowRight");
    expect(result.current.expandedIds).toEqual(new Set([TECH_ID]));
    expect(result.current.selectedBrowseKey).toBe(categoryRowKey(TECH_ID));

    press("ArrowRight");
    expect(result.current.selectedBrowseKey).toBe(feedRowKey(FEED_ID));

    press("ArrowLeft");
    expect(result.current.expandedIds.size).toBe(0);
    expect(result.current.selectedBrowseKey).toBe(categoryRowKey(TECH_ID));
  });

  it("navigates, clears the query and closes on Enter over a browse row", async () => {
    const { router, onQueryChange, onClose, press } = await setup();

    press("ArrowDown");
    press("ArrowDown");
    press("Enter");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/stream/read");
    });
    expect(onQueryChange).toHaveBeenCalledExactlyOnceWith("");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape", async () => {
    const { onClose, press } = await setup();

    press("Escape");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("resets the index and the groups to the current stream's group on reopen", async () => {
    const { result, press, selectRow, setOpen } = await setup({
      streamKey: seedCategoryKey("Tech"),
    });
    expect(result.current.expandedIds).toEqual(new Set([TECH_ID]));

    selectRow(categoryRowKey(TECH_ID));
    press("ArrowLeft");
    expect(result.current.expandedIds.size).toBe(0);

    setOpen(false);
    setOpen(true);

    expect(result.current.selectedIndex).toBe(NO_ROW);
    expect(result.current.expandedIds).toEqual(new Set([TECH_ID]));
  });

  it("ignores Enter and Escape while closed", async () => {
    const { router, onQueryChange, onClose, press } = await setup({ query: "tech", open: false });
    const before = router.state.location.href;

    press("Enter");
    press("Escape");

    expect(onClose).not.toHaveBeenCalled();
    expect(onQueryChange).not.toHaveBeenCalled();
    expect(router.state.location.href).toBe(before);
  });

  it("lands on the start index after an ArrowDown while closed", async () => {
    const { result, press, setOpen } = await setup({ query: "tech", open: false });

    press("ArrowDown");
    setOpen(true);

    expect(result.current.selectedIndex).toBe(0);
  });

  it("keeps a feed stream's group collapsed when feeds load after the open edge", async () => {
    const { result, client, setOpen, release } = await setup({
      streamKey: feedStreamKey(FEED_ID),
      open: false,
      holdFeeds: true,
    });

    setOpen(true);
    release();
    await waitFor(() => {
      expect(client.getQueryState(keys.feeds)?.status).toBe("success");
    });

    expect(result.current.expandedIds.size).toBe(0);
  });
});
