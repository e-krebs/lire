import { act, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { globalAllStreamId } from "shared/feedsApi/streams";
import type { StreamContents } from "shared/feedsApi/types";
import { resetFixtureState } from "client/api/adapters/fixture";
import { getStream } from "client/api/client";
import { keys, useMarkRead } from "client/api/queries";
import profile from "fixtures/seed/profile.json";
import { setViewPrefs, useViewPrefs } from "client/utils/viewPrefs";
import { MosaicGrid } from "../MosaicGrid";

const GLOBAL_ALL = globalAllStreamId(profile.id);

const ui = {
  async unreadToggles(view: RenderResult) {
    return view.findAllByRole("button", { name: "Mark as read" });
  },
  async undoButton(view: RenderResult) {
    return view.findByRole("button", { name: "Undo" });
  },
  async confirmButton(view: RenderResult) {
    return view.findByRole("button", { name: "Confirm" });
  },
  refreshButton(view: RenderResult) {
    return view.getByRole("button", { name: "Refresh" });
  },
  async shortQueryHint(view: RenderResult) {
    return view.findByText(/Type at least \d+ characters to search\./);
  },
  clearSearchLink(view: RenderResult) {
    return view.getByRole("link", { name: "Clear search" });
  },
  queryEmptyState(view: RenderResult) {
    return view.queryByText("Nothing to read here.");
  },
};

const newQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

// jsdom has no IntersectionObserver; the grid only uses it to page in more entries.
class NoIntersectionObserver {
  observe(): void {}
  disconnect(): void {}
}

const setup = ({
  client,
  observer = NoIntersectionObserver,
  query,
}: {
  client: QueryClient;
  observer?: unknown;
  query?: string;
}) => {
  vi.stubGlobal("IntersectionObserver", observer);
  const rootRoute = createRootRoute();
  const streamRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: function StreamView() {
      const { unread } = useViewPrefs();
      return <MosaicGrid streamId={GLOBAL_ALL} unreadOnly={unread} ranked="newest" query={query} />;
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([streamRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  // The freshness row is a `status` too, so the strip goes by its own class.
  const strip = () => view.container.querySelector<HTMLElement>(".undo-strip");
  const card = (entryId: string) =>
    view.container.querySelector(`[data-entry-id="${CSS.escape(entryId)}"]`);
  return { view, strip, card, router };
};

const firstUnreadCard = async (view: RenderResult) => {
  const [toggle] = await ui.unreadToggles(view);
  const entryId = toggle.closest<HTMLElement>("[data-entry-id]")?.dataset.entryId;
  if (entryId === undefined) throw new Error("no unread card to mark");
  return { toggle, entryId };
};

const findStrip = async (strip: () => HTMLElement | null) =>
  waitFor(() => {
    const found = strip();
    if (!found) throw new Error("no undo strip yet");
    return found;
  });

// The countdown is a CSS animation, which jsdom never runs: its end is fired by hand.
const runOutCountdown = async (strip: HTMLElement) => {
  vi.useFakeTimers();
  fireEvent.animationEnd(strip);
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  vi.useRealTimers();
};

describe("MosaicGrid", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("asks for more characters, and clears the search, when the query is too short", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    const { view, router } = setup({ client: newQueryClient(), query: "a" });

    expect(await ui.shortQueryHint(view)).toBeInTheDocument();
    const clear = ui.clearSearchLink(view);
    expect(clear).toHaveAttribute("href", "/");
    expect(router.state.location.pathname).toBe("/");
  });

  it("keeps a confirmed read gone after the grid remounts", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    const client = newQueryClient();

    const first = setup({ client });
    const [toggle] = await ui.unreadToggles(first.view);
    const entryId = toggle.closest<HTMLElement>("[data-entry-id]")?.dataset.entryId;
    if (entryId === undefined) throw new Error("no unread card to mark");

    fireEvent.click(toggle);
    const strip = await waitFor(() => {
      const found = first.strip();
      if (!found) throw new Error("no undo strip yet");
      return found;
    });
    expect(first.card(entryId)).toBeNull();

    // The countdown is a CSS animation, which jsdom never runs: its end is fired by hand.
    vi.useFakeTimers();
    fireEvent.animationEnd(strip);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    vi.useRealTimers();
    expect(first.strip()).toBeNull();
    first.view.unmount();

    const second = setup({ client });
    await ui.unreadToggles(second.view);
    expect(second.strip()).toBeNull();
    expect(second.card(entryId)).toBeNull();
  });

  it("brings the card back when the strip is undone", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    const { view, strip, card } = setup({ client: newQueryClient() });
    const [toggle] = await ui.unreadToggles(view);
    const entryId = toggle.closest<HTMLElement>("[data-entry-id]")?.dataset.entryId;
    if (entryId === undefined) throw new Error("no unread card to mark");

    fireEvent.click(toggle);
    fireEvent.click(await ui.undoButton(view));

    await waitFor(() => {
      expect(card(entryId)).not.toBeNull();
    });
    expect(strip()).toBeNull();
  });

  it("shows an entry marked unread elsewhere again when the view mounts", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    const client = newQueryClient();

    const first = setup({ client });
    const { toggle, entryId } = await firstUnreadCard(first.view);
    fireEvent.click(toggle);
    await runOutCountdown(await findStrip(first.strip));
    first.view.unmount();

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ entryIds: [entryId], read: false });
    });

    const second = setup({ client });
    await waitFor(() => {
      expect(second.card(entryId)).not.toBeNull();
    });
    expect(second.strip()).toBeNull();
  });

  it("keeps the entry in the all-articles cache when unread-only is toggled off mid-countdown", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    const client = newQueryClient();

    const { view, strip, card } = setup({ client });
    const { toggle, entryId } = await firstUnreadCard(view);
    fireEvent.click(toggle);
    await findStrip(strip);

    act(() => {
      setViewPrefs({ unread: false });
    });
    await waitFor(() => {
      expect(card(entryId)).not.toBeNull();
    });
    const leftover = strip();
    if (leftover) await runOutCountdown(leftover);

    const all = client.getQueryData<InfiniteData<StreamContents>>(
      keys.stream({ streamId: GLOBAL_ALL, unreadOnly: false, ranked: "newest" }),
    );
    expect(all?.pages.flatMap((page) => page.items).some((item) => item.id === entryId)).toBe(true);
    expect(card(entryId)).not.toBeNull();
  });

  it("pages past a first page read before mount to the unread entries after it", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    // No refetch on mount, or the first page would come back unread from the fixtures.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const queryKey = keys.stream({ streamId: GLOBAL_ALL, unreadOnly: true, ranked: "newest" });
    const firstPage = await getStream({ streamId: GLOBAL_ALL, unreadOnly: true, ranked: "newest" });
    expect(firstPage.continuation).toBeDefined();
    client.setQueryData<InfiniteData<StreamContents, string | undefined>>(queryKey, {
      pages: [{ ...firstPage, items: firstPage.items.map((item) => ({ ...item, unread: false })) }],
      pageParams: [undefined],
    });

    // The sentinel never reports in view, as below a skeleton taller than the pane: the grid pages
    // on its own.
    const { view, card } = setup({ client });
    const { entryId } = await firstUnreadCard(view);
    expect(firstPage.items.some((item) => item.id === entryId)).toBe(false);
    for (const item of firstPage.items) expect(card(item.id)).toBeNull();
    expect(ui.queryEmptyState(view)).toBeNull();
  });

  it("pages in more when the end sentinel comes into view, and a refresh trims back to one page", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    const callbacks: Array<(records: Array<{ isIntersecting: boolean }>) => void> = [];
    class ReportingIntersectionObserver {
      constructor(callback: (records: Array<{ isIntersecting: boolean }>) => void) {
        callbacks.push(callback);
      }
      observe(): void {}
      disconnect(): void {}
    }
    const { items } = await getStream({ streamId: GLOBAL_ALL, unreadOnly: true, ranked: "newest" });
    const { view } = setup({ client: newQueryClient(), observer: ReportingIntersectionObserver });
    const cards = () => view.container.querySelectorAll("[data-entry-id]").length;
    await waitFor(() => {
      expect(cards()).toBe(items.length);
    });

    act(() => {
      callbacks.at(-1)?.([{ isIntersecting: true }]);
    });
    await waitFor(() => {
      expect(cards()).toBeGreaterThan(items.length);
    });

    fireEvent.click(ui.refreshButton(view));
    await waitFor(() => {
      expect(cards()).toBe(items.length);
    });
  });

  describe("when a card is marked from the keyboard", () => {
    // `fireEvent.click` moves no focus, so the card is focused first and M marks it.
    const markFocused = async (view: RenderResult) => {
      const { toggle, entryId } = await firstUnreadCard(view);
      const link = toggle.closest("[data-entry-id]")?.querySelector("a");
      if (!link) throw new Error("no card link");
      act(() => {
        link.focus();
      });
      fireEvent.keyDown(link, { key: "m" });
      return { entryId };
    };

    it("moves focus to Undo when M marks the focused card", async () => {
      vi.stubEnv("VITE_API_MODE", "mock");
      resetFixtureState();
      const { view } = setup({ client: newQueryClient() });
      await markFocused(view);
      const undo = await ui.undoButton(view);
      await waitFor(() => {
        expect(undo).toHaveFocus();
      });
    });

    it("hands focus back to the restored card after Undo", async () => {
      vi.stubEnv("VITE_API_MODE", "mock");
      resetFixtureState();
      const { view, card } = setup({ client: newQueryClient() });
      const { entryId } = await markFocused(view);
      const undo = await ui.undoButton(view);
      await waitFor(() => {
        expect(undo).toHaveFocus();
      });
      fireEvent.click(undo);
      await waitFor(() => {
        expect(card(entryId)?.querySelector("a")).toHaveFocus();
      });
    });

    it("hands focus to a neighbouring card after Confirm", async () => {
      vi.stubEnv("VITE_API_MODE", "mock");
      resetFixtureState();
      const { view, strip, card } = setup({ client: newQueryClient() });
      const { entryId } = await markFocused(view);
      const found = await findStrip(strip);
      const confirm = await ui.confirmButton(view);
      act(() => {
        confirm.focus();
      });
      fireEvent.click(confirm);
      expect(found.contains(document.activeElement)).toBe(false);
      const focused = document.activeElement?.closest<HTMLElement>("[data-entry-id]");
      expect(focused).not.toBeNull();
      expect(focused?.dataset.entryId).not.toBe(entryId);
      expect(card(entryId)).toBeNull();
    });
  });
});
