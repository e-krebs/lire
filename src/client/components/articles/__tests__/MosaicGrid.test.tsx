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
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntryPage } from "shared/feedsApi/types";
import { resetFixtureState } from "client/api/adapters/fixture";
import { markReadQueue } from "client/api/markReadQueue";
import { getStreamEntries } from "client/api/client";
import { keys, useMarkRead } from "client/api/queries";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";
import { setViewPrefs, useViewPrefs } from "client/utils/viewPrefs";
import { MosaicGrid } from "../MosaicGrid";

const ui = {
  async unreadToggles(view: RenderResult) {
    return view.findAllByRole("button", { name: "Mark as read" });
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
  async noMatch(view: RenderResult) {
    return view.findByText("No articles match “zzzzzzzz”.");
  },
  showAllLink(view: RenderResult) {
    return view.getByRole("link", { name: "Show all articles" });
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
      return <MosaicGrid streamKey="all" unreadOnly={unread} ranked="newest" query={query} />;
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
  const card = (entryId: string) =>
    view.container.querySelector(`[data-entry-id="${CSS.escape(entryId)}"]`);
  return { view, card, router };
};

const firstUnreadCard = async (view: RenderResult) => {
  const [toggle] = await ui.unreadToggles(view);
  const entryId = toggle.closest<HTMLElement>("[data-entry-id]")?.dataset.entryId;
  if (entryId === undefined) throw new Error("no unread card to mark");
  return { toggle, entryId };
};

const closed = async (card: (entryId: string) => Element | null, entryId: string) => {
  await waitFor(() => {
    expect(card(entryId)).toBeNull();
  });
  return true;
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

  it("offers to clear the search and show all articles when nothing matches", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    const { view } = setup({ client: newQueryClient(), query: "zzzzzzzz" });

    await ui.noMatch(view);
    expect(ui.clearSearchLink(view)).toHaveAttribute("href", "/");
    expect(ui.showAllLink(view)).toHaveAttribute("href", "/stream/all?unread=false");
  });

  it("closes a card marked read, and keeps it gone after the grid remounts", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    const client = newQueryClient();

    const first = setup({ client });
    const { toggle, entryId } = await firstUnreadCard(first.view);
    fireEvent.click(toggle);
    await closed(first.card, entryId);
    first.view.unmount();

    const second = setup({ client });
    await ui.unreadToggles(second.view);
    expect(second.card(entryId)).toBeNull();
  });

  it("closes a card marked read outside the grid", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    const client = newQueryClient();
    const { view, card } = setup({ client });
    const { entryId } = await firstUnreadCard(view);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    act(() => {
      result.current.mutate({ entryIds: [entryId], read: true });
    });

    expect(await closed(card, entryId)).toBe(true);
  });

  it("keeps the card when the request to mark it read fails", async () => {
    vi.stubEnv("VITE_API_MODE", "real");
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(fixtureBackend);
    server.use(
      http.post("/api/entries/read", async () => {
        await held;
        return HttpResponse.json({ error: "boom" }, { status: 500 });
      }),
    );
    resetFixtureState();
    const { view, card } = setup({ client: newQueryClient() });
    const { toggle, entryId } = await firstUnreadCard(view);

    fireEvent.click(toggle);
    await closed(card, entryId);
    void markReadQueue.flush();
    release();

    await waitFor(() => {
      expect(card(entryId)).not.toBeNull();
    });
  });

  it("shows an entry marked unread elsewhere again when the view mounts", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    const client = newQueryClient();

    const first = setup({ client });
    const { toggle, entryId } = await firstUnreadCard(first.view);
    fireEvent.click(toggle);
    await closed(first.card, entryId);
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
  });

  it("keeps the entry in the all-articles cache when unread-only is toggled off mid-leave", async () => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    const client = newQueryClient();

    const { view, card } = setup({ client });
    const { toggle, entryId } = await firstUnreadCard(view);
    fireEvent.click(toggle);

    act(() => {
      setViewPrefs({ unread: false });
    });
    await waitFor(() => {
      expect(card(entryId)).not.toBeNull();
    });
    const all = client.getQueryData<InfiniteData<EntryPage>>(
      keys.stream({ streamKey: "all", unreadOnly: false, order: "newest" }),
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
    const queryKey = keys.stream({ streamKey: "all", unreadOnly: true, order: "newest" });
    const firstPage = await getStreamEntries({
      streamKey: "all",
      unreadOnly: true,
      order: "newest",
    });
    expect(firstPage.cursor).toBeDefined();
    client.setQueryData<InfiniteData<EntryPage, string | undefined>>(queryKey, {
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
    const { items } = await getStreamEntries({
      streamKey: "all",
      unreadOnly: true,
      order: "newest",
    });
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

  describe("when a card is navigated from the keyboard", () => {
    it("moves focus with the arrows, Home and End, and ignores other keys", async () => {
      vi.stubEnv("VITE_API_MODE", "mock");
      resetFixtureState();
      const { view } = setup({ client: newQueryClient() });
      await ui.unreadToggles(view);
      const links = () =>
        [...view.container.querySelectorAll("[data-entry-id]")].map((card) =>
          card.querySelector("a"),
        );
      const first = links().at(0);
      const last = links().at(-1);
      if (!first || !last) throw new Error("no cards");
      act(() => {
        first.focus();
      });

      fireEvent.keyDown(first, { key: "End" });
      expect(last).toHaveFocus();
      fireEvent.keyDown(last, { key: "Home" });
      expect(first).toHaveFocus();
      fireEvent.keyDown(first, { key: "ArrowDown" });
      fireEvent.keyDown(document.activeElement ?? first, { key: "ArrowRight" });
      fireEvent.keyDown(document.activeElement ?? first, { key: "ArrowUp" });
      fireEvent.keyDown(document.activeElement ?? first, { key: "ArrowLeft" });
      expect(fireEvent.keyDown(first, { key: "x" })).toBe(true);
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

    it("moves focus to the next card when M marks the focused card", async () => {
      vi.stubEnv("VITE_API_MODE", "mock");
      resetFixtureState();
      const { view, card } = setup({ client: newQueryClient() });
      const { entryId } = await markFocused(view);
      await closed(card, entryId);
      const focused = document.activeElement?.closest<HTMLElement>("[data-entry-id]");
      expect(focused).not.toBeNull();
      expect(focused?.dataset.entryId).not.toBe(entryId);
    });
  });
});
