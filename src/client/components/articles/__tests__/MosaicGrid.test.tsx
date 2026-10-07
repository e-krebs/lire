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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  loadingMore(view: RenderResult) {
    return view.queryByRole("status", { name: "Loading more articles" });
  },
  async findLoadingMore(view: RenderResult) {
    return view.findByRole("status", { name: "Loading more articles" });
  },
  pane(view: RenderResult) {
    return view.getByTestId("pane");
  },
  async findSkeleton(view: RenderResult) {
    return view.findByRole("status", { name: "Loading articles" });
  },
  skeleton(view: RenderResult) {
    return view.queryByRole("status", { name: "Loading articles" });
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
  pane = false,
  readerOpen = false,
}: {
  client: QueryClient;
  observer?: unknown;
  query?: string;
  pane?: boolean;
  readerOpen?: boolean;
}) => {
  vi.stubGlobal("IntersectionObserver", observer);
  const rootRoute = createRootRoute();
  const streamRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: function StreamView() {
      const { unread } = useViewPrefs();
      return (
        <MosaicGrid
          streamKey="all"
          unreadOnly={unread}
          ranked="newest"
          query={query}
          readerOpen={readerOpen}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([streamRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const view = render(
    <QueryClientProvider client={client}>
      {pane ? (
        <div className="scroll-pane" data-testid="pane">
          <RouterProvider router={router} />
        </div>
      ) : (
        <RouterProvider router={router} />
      )}
    </QueryClientProvider>,
  );
  const card = (entryId: string) =>
    view.container.querySelector(`[data-entry-id="${CSS.escape(entryId)}"]`);
  return { view, card, router };
};

// jsdom reports every layout box as 0, so the bottom edge needs the numbers planted.
const atBottom = (view: RenderResult) => {
  const pane = ui.pane(view);
  const scrollTo = vi.fn<() => void>();
  for (const [key, value] of Object.entries({
    scrollTop: 500,
    clientHeight: 500,
    scrollHeight: 1000,
    scrollTo,
  })) {
    Object.defineProperty(pane, key, { value, writable: true, configurable: true });
  }
  return { pane, scrollTo };
};

const touch = ({ type, y }: { type: string; y: number }): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const list = type === "touchend" ? [] : [{ clientX: 0, clientY: y }];
  Object.defineProperty(event, "touches", { value: list });
  return event;
};

// A last page and a first page before it, in a cache that never goes stale on its own.
const seedTwoPages = async ({
  client,
  count,
}: {
  client: QueryClient;
  count: number | undefined;
}) => {
  const params = { streamKey: "all", unreadOnly: true, order: "newest", count } as const;
  const first = await getStreamEntries(params);
  const second = await getStreamEntries({ ...params, cursor: first.cursor });
  client.setQueryData<InfiniteData<EntryPage, string | undefined>>(keys.stream(params), {
    pages: [first, { ...second, cursor: undefined }],
    pageParams: [undefined, first.cursor],
  });
  return { total: first.items.length + second.items.length };
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
        return HttpResponse.json({ error: "boom" }, { status: 400 });
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
      keys.stream({
        streamKey: "all",
        unreadOnly: false,
        order: "newest",
        count: 24,
      }),
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
    const queryKey = keys.stream({
      streamKey: "all",
      unreadOnly: true,
      order: "newest",
      count: 24,
    });
    const firstPage = await getStreamEntries({
      streamKey: "all",
      unreadOnly: true,
      order: "newest",
      count: 24,
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

  it("shows a row of skeleton tiles while the next page loads, and drops it when the page lands", async () => {
    vi.stubEnv("VITE_API_MODE", "real");
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(fixtureBackend);
    server.use(
      http.get("/api/streams/:streamKey/entries", async ({ request }) => {
        // Returning nothing falls through to the fixture backend once released.
        if (new URL(request.url).searchParams.has("cursor")) await held;
      }),
    );
    resetFixtureState();
    const callbacks: Array<(records: Array<{ isIntersecting: boolean }>) => void> = [];
    class ReportingIntersectionObserver {
      constructor(callback: (records: Array<{ isIntersecting: boolean }>) => void) {
        callbacks.push(callback);
      }
      observe(): void {}
      disconnect(): void {}
    }
    const { view } = setup({ client: newQueryClient(), observer: ReportingIntersectionObserver });
    await ui.unreadToggles(view);
    expect(ui.loadingMore(view)).toBeNull();

    act(() => {
      callbacks.at(-1)?.([{ isIntersecting: true }]);
    });
    expect(await ui.findLoadingMore(view)).toBeInTheDocument();

    release();
    await waitFor(() => {
      expect(ui.loadingMore(view)).toBeNull();
    });
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
      count: 24,
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

  describe("when the list is pulled up at its end", () => {
    let hold = false;
    const setupAtEnd = async () => {
      vi.stubEnv("VITE_API_MODE", "real");
      server.use(
        fixtureBackend,
        http.get("/api/streams/:streamKey/entries", async () => {
          if (!hold) return;
          await new Promise(() => {});
        }),
      );
      resetFixtureState();
      hold = false;
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
      });
      const { total } = await seedTwoPages({ client, count: 24 });
      const { view } = setup({ client, pane: true });
      const { pane, scrollTo } = atBottom(view);
      const cards = () => view.container.querySelectorAll("[data-entry-id]").length;
      await waitFor(() => {
        expect(cards()).toBe(total);
      });
      return { view, pane, scrollTo, cards, total };
    };

    it("refreshes like the top pull: trims to the first page and scrolls to the top", async () => {
      const { pane, scrollTo, cards, total } = await setupAtEnd();

      fireEvent(pane, touch({ type: "touchstart", y: 300 }));
      const move = touch({ type: "touchmove", y: 100 });
      fireEvent(pane, move);
      expect(move.defaultPrevented).toBe(true);
      fireEvent(pane, touch({ type: "touchend", y: 100 }));

      await waitFor(() => {
        expect(cards()).toBeGreaterThan(0);
        expect(cards()).toBeLessThan(total);
      });
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    });

    it("does not arm the pull while a refresh is fetching", async () => {
      const { view, pane } = await setupAtEnd();
      hold = true;
      fireEvent.click(ui.refreshButton(view));
      await waitFor(() => {
        expect(ui.refreshButton(view)).toHaveAttribute("aria-busy", "true");
      });

      fireEvent(pane, touch({ type: "touchstart", y: 300 }));
      const move = touch({ type: "touchmove", y: 100 });
      fireEvent(pane, move);
      expect(move.defaultPrevented).toBe(false);
    });
  });

  it("refreshes from a bottom pull when nothing matches", async () => {
    vi.stubEnv("VITE_API_MODE", "real");
    server.use(fixtureBackend);
    resetFixtureState();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const { view } = setup({ client, query: "zzzzzzzz", pane: true });
    await ui.noMatch(view);
    const { pane } = atBottom(view);

    let requests = 0;
    const count = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname.endsWith("/entries")) requests += 1;
    };
    server.events.on("request:start", count);
    try {
      fireEvent(pane, touch({ type: "touchstart", y: 300 }));
      const move = touch({ type: "touchmove", y: 100 });
      fireEvent(pane, move);
      expect(move.defaultPrevented).toBe(true);
      fireEvent(pane, touch({ type: "touchend", y: 100 }));
      await waitFor(() => {
        expect(requests).toBeGreaterThan(0);
      });
    } finally {
      server.events.removeListener("request:start", count);
    }
  });

  describe("when the first page is refetched", () => {
    let release = () => {};
    let requests: URL[] = [];
    const hold = () => {
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      server.use(
        http.get("/api/streams/:streamKey/entries", async ({ request }) => {
          requests.push(new URL(request.url));
          await gate;
        }),
        fixtureBackend,
      );
    };
    const open = async ({ readerOpen = false }: { readerOpen?: boolean } = {}) => {
      // The phone tier asks for the server's default page size.
      const count = readerOpen ? undefined : 24;
      vi.stubEnv("VITE_API_MODE", "real");
      server.use(fixtureBackend);
      resetFixtureState();
      requests = [];
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
      });
      const { total } = await seedTwoPages({ client, count });
      const callbacks: Array<(records: Array<{ isIntersecting: boolean }>) => void> = [];
      class ReportingIntersectionObserver {
        constructor(callback: (records: Array<{ isIntersecting: boolean }>) => void) {
          callbacks.push(callback);
        }
        observe(): void {}
        disconnect(): void {}
      }
      const grid = setup({
        client,
        pane: true,
        readerOpen,
        observer: ReportingIntersectionObserver,
      });
      const cards = () => grid.view.container.querySelectorAll("[data-entry-id]").length;
      await waitFor(() => {
        expect(cards()).toBe(total);
      });
      return { ...grid, cards, total, callbacks };
    };
    // Hidden for over a minute, then visible again.
    const returnToTheApp = () => {
      let state: DocumentVisibilityState = "hidden";
      vi.spyOn(document, "visibilityState", "get").mockImplementation(() => state);
      const now = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(now);
      document.dispatchEvent(new Event("visibilitychange"));
      clock.mockReturnValue(now + 61_000);
      state = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    };

    // jsdom has no Element.scrollTo.
    beforeEach(() => {
      Object.defineProperty(Element.prototype, "scrollTo", {
        value: () => {},
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      release();
      vi.restoreAllMocks();
      Reflect.deleteProperty(Element.prototype, "scrollTo");
    });

    it("shows the skeleton in place of the grid, then the new first page", async () => {
      const { view, cards, total } = await open();
      hold();

      fireEvent.click(ui.refreshButton(view));

      expect(await ui.findSkeleton(view)).toBeInTheDocument();
      expect(cards()).toBe(0);
      expect(ui.pane(view)).toHaveAttribute("data-skeleton");
      expect(ui.refreshButton(view)).toBeInTheDocument();

      release();
      await waitFor(() => {
        expect(cards()).toBeGreaterThan(0);
      });
      expect(cards()).toBeLessThan(total);
      expect(ui.skeleton(view)).toBeNull();
      expect(ui.pane(view)).not.toHaveAttribute("data-skeleton");
    });

    it("hides the pane's scrollbar during the first load too, and not after", async () => {
      vi.stubEnv("VITE_API_MODE", "real");
      resetFixtureState();
      hold();
      const { view } = setup({ client: newQueryClient(), pane: true });

      expect(await ui.findSkeleton(view)).toBeInTheDocument();
      expect(ui.pane(view)).toHaveAttribute("data-skeleton");

      server.use(fixtureBackend);
      release();
      await ui.unreadToggles(view);
      expect(ui.pane(view)).not.toHaveAttribute("data-skeleton");
    });

    it("keeps the skeleton until a second refresh that joined the first one is done", async () => {
      const { view, cards } = await open();
      hold();

      fireEvent.click(ui.refreshButton(view));
      await ui.findSkeleton(view);
      fireEvent.click(ui.refreshButton(view));
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(ui.skeleton(view)).toBeInTheDocument();
      expect(ui.pane(view)).toHaveAttribute("data-skeleton");
      expect(requests.filter((url) => !url.searchParams.has("cursor"))).toHaveLength(1);

      release();
      await waitFor(() => {
        expect(cards()).toBeGreaterThan(0);
      });
      expect(ui.skeleton(view)).toBeNull();
    });

    it("does not fetch the next page when the sentinel reports during the swap", async () => {
      const { view, callbacks, cards } = await open();
      hold();

      fireEvent.click(ui.refreshButton(view));
      await ui.findSkeleton(view);
      act(() => {
        for (const callback of callbacks) callback([{ isIntersecting: true }]);
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(requests.some((url) => url.searchParams.has("cursor"))).toBe(false);

      release();
      await waitFor(() => {
        expect(cards()).toBeGreaterThan(0);
      });
    });

    it("refreshes like a user refresh when the app returns to the foreground", async () => {
      const { view, cards, total } = await open();
      const { scrollTo } = atBottom(view);
      hold();

      returnToTheApp();

      expect(await ui.findSkeleton(view)).toBeInTheDocument();
      expect(ui.pane(view)).toHaveAttribute("data-skeleton");
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });

      release();
      await waitFor(() => {
        expect(cards()).toBeGreaterThan(0);
      });
      expect(cards()).toBeLessThan(total);
    });

    it("keeps the pages and the skeleton away when the reader covers the list", async () => {
      vi.stubGlobal("matchMedia", (media: string) => ({
        media,
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      }));
      const { view, cards, total } = await open({ readerOpen: true });
      hold();

      returnToTheApp();
      await waitFor(() => {
        expect(requests.length).toBeGreaterThan(0);
      });

      expect(ui.skeleton(view)).toBeNull();
      expect(ui.pane(view)).not.toHaveAttribute("data-skeleton");
      expect(cards()).toBe(total);

      release();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(cards()).toBe(total);
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
