import { useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { MatchCount } from "client/api/queries";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, type HttpHandler } from "msw";
import { describe, expect, it, vi } from "vitest";
import { parseStreamKey, toStreamKey } from "shared/feedsApi/streamKey";
import { resetFixtureState } from "client/api/adapters/fixture";
import { updatePreferences } from "client/api/client";
import { CATEGORY_ORDER_KEY } from "shared/feedsApi/preferences";
import { keys, useCategories, useFeeds } from "client/api/queries";
import { setLocalePreference } from "client/i18n/locale";
import { setBarPosition } from "client/hooks/utils/barPosition";
import { catalogs } from "client/i18n/messages";
import { streamLabel } from "client/utils/streamLabel";
import type { Category, Feed } from "shared/feedsApi/types";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";
import { seedCategoryId, seedCategoryKey } from "test/seedCategories";
import { LocationBar } from "../LocationBar";
import { Navigator } from "../Navigator";
import type { NavigatorPanelHandle } from "../Navigator";

const TECH_KEY = seedCategoryKey("Tech");
const FEED_KEY = "feed:101";
// Navigator's own gap between the pill and the panel.
const POPOVER_GAP = 6;

type TouchType = "touchstart" | "touchmove" | "touchend";

const ui = {
  get dialog() {
    return screen.queryByRole("dialog", { name: "Navigator" });
  },
  get popover() {
    return screen.getByLabelText("Navigator");
  },
  get search() {
    return screen.findByLabelText("Search articles and feeds");
  },
  get frenchSearch() {
    return screen.findByLabelText("Rechercher des articles et des flux");
  },
  // The row's accessible name ends with its unread count, so the label's own text finds it.
  get allArticles() {
    return screen.queryByText("All articles")?.closest("button") ?? null;
  },
  queryButton(name: string) {
    return screen.queryByRole("button", { name });
  },
  get buttons() {
    return screen.queryAllByRole("button");
  },
  // A typed query shows the matches *and* the tree below them, so a feed or category can
  // legitimately hold two rows at once.
  async rows(name: string | RegExp) {
    return screen.findAllByRole("button", { name });
  },
  async searchRow(query: string) {
    return (await screen.findByText(`Search articles for “${query}”`)).closest("button");
  },
  editLink(title: string) {
    return screen.queryByRole("link", { name: `Edit ${title}` });
  },
  async editLinks(title: string) {
    return screen.findAllByRole("link", { name: `Edit ${title}` });
  },
  get links() {
    return screen.queryAllByRole("link");
  },
  get manageLink() {
    return screen.getByRole("link", { name: "Manage subscriptions" });
  },
  // The collapse chevron of a category group.
  async toggle(label: string) {
    return screen.findByRole("button", { name: `Toggle ${label}` });
  },
  get recentlyRead() {
    return screen.getByText("Recently read").closest("button")!;
  },
  get clearText() {
    return screen.getByRole("button", { name: "Clear search text" });
  },
  async feedRow() {
    return screen.findByRole("button", { name: /^Example Tech Daily/ });
  },
  async categoryRow() {
    return screen.findByRole("button", { name: /^Tech\b/ });
  },
  async clearScope(label: string) {
    return within(await screen.findByRole("dialog", { name: "Navigator" })).findByRole("button", {
      name: `Search everywhere instead of ${label}`,
    });
  },
  async pill() {
    return within(await screen.findByRole("group", { name: "Location" }));
  },
  async text(text: string) {
    return screen.findByText(text);
  },
  get loadingCategories() {
    return screen.queryByRole("status", { name: "Loading categories" });
  },
  get selected() {
    return document.querySelector("[data-selected]");
  },
  // One finger from `from` to `to`, past the sheet's drag slop in one move.
  swipe({ target, from, to }: { target: Element; from: number; to: number }): void {
    // jsdom has no TouchEvent constructor that takes touches, so the lists are planted — and the
    // sheet reads `changedTouches.item()`, which a bare array does not have.
    const touch = ({ type, clientY }: { type: TouchType; clientY: number }): void => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const points = [{ clientX: 0, clientY }];
      const list = Object.assign(points, { item: (index: number) => points[index] ?? null });
      Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : list });
      Object.defineProperty(event, "changedTouches", { value: list });
      fireEvent(target, event);
    };
    touch({ type: "touchstart", clientY: from });
    touch({ type: "touchmove", clientY: to });
    touch({ type: "touchend", clientY: to });
  },
};

const setup = ({
  tier = "phone",
  streamKey = "all",
  barPosition = "top",
  handlers = [],
  count,
}: {
  count?: MatchCount;
  tier?: "phone" | "desktop";
  streamKey?: string;
  barPosition?: Parameters<typeof setBarPosition>[0];
  handlers?: HttpHandler[];
} = {}) => {
  vi.stubEnv("VITE_API_MODE", "real");
  server.use(fixtureBackend);
  // Added after the catch-all, so they match first.
  server.use(...handlers);
  resetFixtureState();
  // The bar position is module state, so every case sets it again.
  setBarPosition(barPosition);
  // jsdom has no matchMedia, so useTier() falls back to "desktop" on its own — the phone-tier
  // (bottom sheet) assertions are the ones that need a stub.
  let matches = tier === "desktop";
  const tierListeners = new Set<() => void>();
  // oxlint-disable typescript/no-unsafe-type-assertion -- test stub: useTier only reads
  // `matches` and (de)registers listeners, never the rest of MediaQueryList.
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches,
        media: query,
        addEventListener: (_type: string, listener: () => void) => tierListeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) =>
          tierListeners.delete(listener),
      }) as unknown as MediaQueryList,
  );
  // oxlint-enable typescript/no-unsafe-type-assertion

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Harness count={count} />
        <Outlet />
      </>
    ),
  });
  const streamRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/stream/$streamKey",
    validateSearch: (search: Record<string, unknown>): { q?: string } => ({
      q: typeof search.q === "string" && search.q.trim() !== "" ? search.q : undefined,
    }),
    component: ReceivedStreamKey,
  });
  const subscriptionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/subscriptions",
    component: () => <p>subscriptions page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([streamRoute, subscriptionsRoute]),
    history: createMemoryHistory({ initialEntries: [`/stream/${encodeURIComponent(streamKey)}`] }),
  });

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  const feedTitled = (title: string): Feed => {
    const found = client.getQueryData<Feed[]>(keys.feeds)?.find((feed) => feed.title === title);
    if (!found) throw new Error(`no feed titled ${title}`);
    return found;
  };
  const categoryLabeled = (label: string): Category => {
    const found = client
      .getQueryData<Category[]>(keys.categories)
      ?.find((category) => category.label === label);
    if (!found) throw new Error(`no category labeled ${label}`);
    return found;
  };
  // Every seed feed sits in a category, so no row appears only once feeds load.
  const feedsLoaded = async () =>
    waitFor(() => {
      expect(client.getQueryState(keys.feeds)?.status).toBe("success");
    });

  const switchTier = (next: "phone" | "desktop"): void => {
    matches = next === "desktop";
    act(() => {
      for (const listener of tierListeners) listener();
    });
  };

  return {
    router,
    switchTier,
    feedTitled,
    categoryLabeled,
    feedsLoaded,
    user: userEvent.setup(),
  };
};

const searchParamsOf = (link: HTMLElement): URLSearchParams =>
  new URL(link.getAttribute("href") ?? "", location.origin).searchParams;

// Prints the search string too, so a test can tell an article search (`?q=…`) from a plain
// stream navigation.
const ReceivedStreamKey = () => {
  const { streamKey } = useParams({ strict: false });
  const { searchStr } = useLocation();
  return (
    <p>
      received:{streamKey}
      {searchStr}
    </p>
  );
};

// A stand-in for TopBar: the route is the only source of truth (the stream is the chip, `q` is
// the text), and the bar owns nothing but whether the panel is open and the draft being typed.
// Mounted above the route tree, like the real one, so a test can drive either surface.
const Harness = ({ count }: { count: MatchCount | undefined }) => {
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const categories = useCategories();
  const feeds = useFeeds();
  const streamKey = params.streamKey;
  const articleQuery = typeof search.q === "string" ? search.q : undefined;
  const [panelOpen, setPanelOpen] = useState(true);
  const [draft, setDraft] = useState(articleQuery ?? "");
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelHandleRef = useRef<NavigatorPanelHandle>(null);

  const scopeKey = streamKey ?? "all";
  const scopeStream = parseStreamKey(scopeKey) ?? { kind: "all" as const };
  const scopeLabel = streamLabel({
    stream: scopeStream,
    categories: categories.data,
    feeds: feeds.data,
    labels: {
      allArticles: catalogs.en.navigation.allArticles,
      recentlyRead: catalogs.en.navigation.recentlyRead,
      uncategorized: catalogs.en.shell.uncategorized,
    },
  }).label;

  const openPanel = (): void => {
    if (panelOpen) return;
    setDraft(articleQuery ?? "");
    setPanelOpen(true);
  };
  const focusInput = (): void => {
    inputRef.current?.focus();
  };
  const clearScope = (): void => {
    void navigate({
      to: "/stream/$streamKey",
      params: { streamKey: "all" },
      search: (prev) => prev,
    });
  };
  const clearText = (): void => {
    focusInput();
    setDraft("");
    if (articleQuery !== undefined) {
      void navigate({
        to: "/stream/$streamKey",
        params: { streamKey: scopeKey },
        search: (prev) => ({ ...prev, q: undefined }),
      });
    }
  };

  return (
    <>
      <LocationBar
        ref={barRef}
        onOpen={openPanel}
        draft={draft}
        onDraftChange={setDraft}
        onSearchKeyDown={(event) => {
          panelHandleRef.current?.handleKeyDown(event);
        }}
        inputRef={inputRef}
        clearable={scopeKey !== "all"}
        scopeLabel={scopeLabel}
        count={count}
        onClearScope={clearScope}
        onClearText={clearText}
      />
      <Navigator
        open={panelOpen}
        onClose={() => {
          setPanelOpen(false);
        }}
        onRequestFocus={focusInput}
        query={draft}
        onQueryChange={setDraft}
        anchorRef={barRef}
        panelHandleRef={panelHandleRef}
        clearable={scopeKey !== "all"}
        scopeKey={scopeKey}
        scopeLabel={scopeLabel}
        onClearScope={clearScope}
        onClearText={clearText}
      />
    </>
  );
};

describe("Navigator", () => {
  describe("when on a phone (bottom sheet)", () => {
    it("renders the browse tree with unread counts", async () => {
      const { user } = setup();

      await waitFor(() => {
        expect(ui.allArticles?.textContent).toMatch(/\d+/);
      });

      await waitFor(() => expect(ui.queryButton("Tech")).toBeInTheDocument());
      // Groups start collapsed: the feed shows only after its category is expanded.
      expect(ui.queryButton("Example Tech Daily")).not.toBeInTheDocument();
      await user.click(await ui.toggle("Tech"));
      await waitFor(() => expect(ui.queryButton("Example Tech Daily")).toBeInTheDocument());
    });

    it("filters on typing, pre-selecting the article-search row", async () => {
      const { user, feedsLoaded } = setup();
      // Wait for both the categories and the feeds queries to resolve — typing "tech"
      // before then would filter over an empty tree and match nothing.
      await waitFor(() => expect(ui.queryButton("Tech")).toBeInTheDocument());
      await feedsLoaded();

      await user.type(await ui.search, "tech");

      await waitFor(() => expect(ui.selected).toHaveTextContent("Search articles for “tech”"));
      // The scope's name needs the profile (the route carries only the stream key), so it can
      // land a tick after the row itself.
      expect(await ui.text("in All articles")).toBeInTheDocument();
      // The matches are still there, one ArrowDown below — and the tree stays browsable under
      // them, so "Tech" now holds two rows: the match and the tree row.
      expect(await ui.rows("Tech")).toHaveLength(2);
      expect(ui.queryButton("Recently read")).toBeInTheDocument();
    });

    it("reaches the browse tree with ArrowDown past the matches of a typed query", async () => {
      const { user, feedsLoaded } = setup();
      await waitFor(() => expect(ui.queryButton("Tech")).toBeInTheDocument());
      await feedsLoaded();

      await user.type(await ui.search, "tech");
      // The search row, then the two matches — "Tech" and "Example Tech Daily".
      await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");

      await waitFor(() => expect(ui.selected).toHaveTextContent("All articles"));
    });

    it("collapses the surrounding collection when ArrowLeft leaves a feed row", async () => {
      const { user, feedsLoaded } = setup();
      await feedsLoaded();

      await user.click(await ui.toggle("Tech"));
      await waitFor(() => expect(ui.queryButton("Example Tech Daily")).toBeInTheDocument());

      await user.click(await ui.search);
      // All articles, Recently read, Tech, then the collection's first feed.
      await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowLeft}");

      expect(ui.queryButton("Example Tech Daily")).not.toBeInTheDocument();
      await waitFor(() => expect(ui.selected).toHaveTextContent("Tech"));
    });

    it("keeps only Manage subscriptions in the footer", async () => {
      const { feedsLoaded } = setup();
      await feedsLoaded();

      expect(ui.manageLink).toBeInTheDocument();
      expect(ui.queryButton("Add a feed…")).not.toBeInTheDocument();
    });

    it("browses only: management lives on the subscriptions page, one edit link away", async () => {
      const { user, feedsLoaded } = setup();
      await feedsLoaded();
      await user.click(await ui.toggle("Tech"));
      await waitFor(() => expect(ui.queryButton("Example Tech Daily")).toBeInTheDocument());

      expect(ui.editLink("Example Tech Daily")).toBeInTheDocument();
      const names = ui.buttons.map(
        (button) => button.getAttribute("aria-label") ?? button.textContent,
      );
      expect(names.filter((name) => /^(Actions for |Rename|Delete)/.test(name))).toEqual([]);
      expect(ui.queryButton("Unsubscribe")).not.toBeInTheDocument();
    });

    it("links a feed row to its panel on the subscriptions page", async () => {
      const { user, feedTitled, feedsLoaded } = setup();
      await feedsLoaded();
      await user.click(await ui.toggle("Tech"));
      await waitFor(() => expect(ui.editLink("Example Tech Daily")).toBeInTheDocument());

      const params = searchParamsOf(ui.editLink("Example Tech Daily")!);
      expect(params.get("tab")).toBe("feeds");
      // The router JSON-encodes a numeric-looking string in the search.
      expect(params.get("feed")).toBe(JSON.stringify(feedTitled("Example Tech Daily").id));
    });

    it("links a category row to its panel on the subscriptions page", async () => {
      const { categoryLabeled, feedsLoaded } = setup();
      await feedsLoaded();
      await waitFor(() => expect(ui.editLink("Tech")).toBeInTheDocument());

      const params = searchParamsOf(ui.editLink("Tech")!);
      expect(params.get("tab")).toBe("categories");
      expect(params.get("category")).toBe(categoryLabeled("Tech").id);
    });

    it("gives All articles and Recently read no edit link", async () => {
      const { feedsLoaded } = setup();
      await feedsLoaded();
      await waitFor(() => expect(ui.editLink("Tech")).toBeInTheDocument());

      expect(ui.editLink("All articles")).not.toBeInTheDocument();
      expect(ui.editLink("Recently read")).not.toBeInTheDocument();
    });

    // jsdom has no layout, so the shared right gutter stands in for the badges lining up.
    it("keeps the edit link's gutter on every row, so the counts line up", async () => {
      const { user, feedsLoaded } = setup();
      await feedsLoaded();
      await waitFor(() => expect(ui.queryButton("Tech")).toBeInTheDocument());

      expect(ui.allArticles).toHaveClass("pr-10");
      expect(ui.queryButton("Recently read")).toHaveClass("pr-10");
      expect(ui.queryButton("Tech")).toHaveClass("pr-10");

      await user.type(await ui.search, "tech");
      const searchRow = await ui.searchRow("tech");
      expect(ui.selected).toContainElement(searchRow);
      expect(searchRow).toHaveClass("pr-10");
    });

    it("links both rows of a typed match to the same panel", async () => {
      const { user, categoryLabeled, feedsLoaded } = setup();
      await waitFor(() => expect(ui.queryButton("Tech")).toBeInTheDocument());
      await feedsLoaded();

      await user.type(await ui.search, "tech");

      const links = await ui.editLinks("Tech");
      expect(links).toHaveLength(2);
      for (const link of links) {
        expect(searchParamsOf(link).get("category")).toBe(categoryLabeled("Tech").id);
      }
    });

    it("opens the panel and closes the navigator when an edit link is clicked", async () => {
      const { user, router, feedTitled, feedsLoaded } = setup();
      await feedsLoaded();
      await user.click(await ui.toggle("Tech"));
      await waitFor(() => expect(ui.editLink("Example Tech Daily")).toBeInTheDocument());

      await user.click(ui.editLink("Example Tech Daily")!);

      expect(await ui.text("subscriptions page")).toBeInTheDocument();
      expect(router.state.location.search).toMatchObject({
        tab: "feeds",
        feed: feedTitled("Example Tech Daily").id,
      });
      await waitFor(() => {
        expect(ui.dialog).not.toBeInTheDocument();
      });
    });

    it("searches articles in the scope when Enter follows a typed query", async () => {
      const { user, feedsLoaded } = setup();
      await waitFor(() => expect(ui.queryButton("Tech")).toBeInTheDocument());
      await feedsLoaded();

      await user.type(await ui.search, "tech");
      await user.keyboard("{Enter}");

      expect(await ui.text("received:all?q=tech")).toBeInTheDocument();
    });

    it("highlights no browse row until an arrow key asks for one", async () => {
      const { user, feedsLoaded } = setup();
      await feedsLoaded();

      await user.click(await ui.search);
      expect(ui.selected).toBeNull();

      await user.keyboard("{ArrowDown}");
      await waitFor(() => expect(ui.selected).toHaveTextContent("All articles"));
    });

    it("walks the browse rows with ArrowDown when no query narrows the panel", async () => {
      const { user, feedsLoaded } = setup();
      await feedsLoaded();

      await user.click(await ui.search);
      await user.keyboard("{ArrowDown}{ArrowDown}");

      await waitFor(() => expect(ui.selected).toHaveTextContent("Recently read"));

      await user.keyboard("{Enter}");

      expect(await ui.text("received:read")).toBeInTheDocument();
    });

    it("highlights Manage subscriptions as the last browse row, Enter opening it", async () => {
      const { user, feedsLoaded } = setup();
      await feedsLoaded();

      await user.click(await ui.search);
      // The order doesn't wrap and clamps on its last row, so overshooting lands on the footer
      // link whatever the fixture tree holds.
      await user.keyboard("{ArrowDown>20/}");

      const link = ui.manageLink;
      await waitFor(() => {
        expect(link).toHaveAttribute("data-selected");
      });

      await user.keyboard("{Enter}");

      expect(await ui.text("subscriptions page")).toBeInTheDocument();
    });

    it("clears a non-default scope from the chip, widening to every article", async () => {
      const { user } = setup({ streamKey: TECH_KEY });

      await user.click(await ui.clearScope("Tech"));

      expect(await ui.text("received:all")).toBeInTheDocument();
    });

    it("leads with the article-search row when the query is a URL, offering no subscribe", async () => {
      const { user } = setup();

      await user.type(await ui.search, "https://example.org/feed");

      expect(await ui.text("Search articles for “https://example.org/feed”")).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(/Subscribe to /);
    });

    it("activates a feed result with ArrowDown then Enter, dropping the text", async () => {
      const { user, feedsLoaded } = setup();
      await waitFor(() => expect(ui.queryButton("Tech")).toBeInTheDocument());
      await feedsLoaded();

      await user.type(await ui.search, "Longform");
      await user.keyboard("{ArrowDown}{Enter}");

      expect(await ui.text("received:feed:109")).toBeInTheDocument();
    });
  });

  describe("when the location bar shows its chip", () => {
    it("names All on the default scope, with no ×", async () => {
      setup({ tier: "desktop" });

      expect(await (await ui.pill()).findByText("All")).toBeInTheDocument();
      expect(
        (await ui.pill()).queryByRole("button", { name: /^Search everywhere instead of/ }),
      ).toBeNull();
    });

    it("leaves the scope alone on Backspace over All", async () => {
      const { user, router } = setup({ tier: "desktop" });

      await user.click(await ui.search);
      await user.keyboard("{Backspace}");

      expect(router.state.location.pathname).toBe("/stream/all");
    });

    it.each([
      { count: { count: 12, capped: false }, shown: "12", spoken: "12 articles" },
      { count: { count: 50, capped: true }, shown: "50+", spoken: "50 or more articles" },
    ])("shows the $shown badge with a spoken label", async ({ count, shown, spoken }) => {
      setup({ tier: "desktop", streamKey: TECH_KEY, count });

      expect(await (await ui.pill()).findByText(shown)).toBeInTheDocument();
      expect((await ui.pill()).getByText(spoken)).toBeInTheDocument();
    });

    it("shows no badge without a count", async () => {
      setup({ tier: "desktop", streamKey: TECH_KEY });

      await (await ui.pill()).findByText("Tech");
      expect((await ui.pill()).queryByText(/articles$/)).toBeNull();
    });
  });

  describe("when the phone pill has a narrowed scope", () => {
    it("clears the scope from its ×, without opening the sheet", async () => {
      const { user } = setup({ streamKey: TECH_KEY });
      await user.click(await ui.search);
      await user.keyboard("{Escape}");
      await waitFor(() => expect(ui.dialog).not.toBeInTheDocument());

      const clear = await (
        await ui.pill()
      ).findByRole("button", {
        name: "Search everywhere instead of Tech",
      });
      expect((await ui.pill()).getByText("Tech").parentElement).toContainElement(clear);
      await user.click(clear);

      expect(await ui.text("received:all")).toBeInTheDocument();
      expect(ui.dialog).not.toBeInTheDocument();
    });

    it("shows no × on All", async () => {
      setup();

      await (await ui.pill()).findByText("All");
      expect(
        (await ui.pill()).queryByRole("button", { name: /^Search everywhere instead of/ }),
      ).toBeNull();
    });
  });

  describe("when the stored category order is still loading", () => {
    // Holds GET /v3/preferences until release, then lets it fall through to fixtureBackend.
    const holdPreferences = () => {
      let release = (): void => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const handler = http.get("/api/preferences", async () => {
        await held;
      });
      return { handler, release };
    };

    it("holds the category rows behind a placeholder until the stored order loads", async () => {
      const { handler, release } = holdPreferences();
      const { feedsLoaded } = setup({ handlers: [handler] });
      const stored = ["Newsletters", "News", "Design", "Tech"];
      await updatePreferences({ [CATEGORY_ORDER_KEY]: JSON.stringify(stored.map(seedCategoryId)) });

      await waitFor(() => expect(ui.allArticles).toBeInTheDocument());
      await feedsLoaded();
      expect(ui.loadingCategories).toHaveAttribute("aria-busy", "true");
      expect(ui.queryButton("Tech")).not.toBeInTheDocument();

      release();
      await waitFor(() => {
        const editLabels = ui.links
          .map((link) => link.getAttribute("aria-label"))
          .filter((label) => label?.startsWith("Edit "));
        expect(editLabels).toEqual(stored.map((label) => `Edit ${label}`));
      });
      expect(ui.loadingCategories).not.toBeInTheDocument();
    });

    it("skips the held category rows when ArrowDown walks the browse tree", async () => {
      const { handler, release } = holdPreferences();
      const { user, feedsLoaded } = setup({ handlers: [handler] });
      await feedsLoaded();

      await user.click(await ui.search);
      await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");

      expect(ui.manageLink).toHaveAttribute("data-selected");
      release();
      // A request still held when the test ends would fall through to handlers already reset.
      await waitFor(() => expect(ui.loadingCategories).not.toBeInTheDocument());
    });
  });

  describe("when the tier changes while open", () => {
    it("keeps the panel's state", async () => {
      const { user, switchTier } = setup();
      await user.click(await ui.toggle("Tech"));
      await waitFor(() => expect(ui.queryButton("Example Tech Daily")).toBeInTheDocument());

      switchTier("desktop");

      expect(ui.dialog).not.toBeInTheDocument();
      expect(ui.queryButton("Example Tech Daily")).toBeInTheDocument();
    });
  });

  describe("when on desktop or tablet (anchored popover)", () => {
    it("reads its interpolated labels in French", async () => {
      setLocalePreference("fr");
      const { user } = setup({ tier: "desktop" });

      await user.type(await ui.frenchSearch, "zzz");

      expect(await ui.text("Rechercher des articles pour « zzz »")).toBeInTheDocument();
      expect(await ui.text("Aucun flux ni catégorie ne correspond à « zzz ».")).toBeInTheDocument();
    });

    it("keeps the field, and its focus, when Escape closes the panel", async () => {
      const { user } = setup({ tier: "desktop" });

      expect(ui.dialog).not.toBeInTheDocument();
      const field = await ui.search;
      await user.click(field);
      await waitFor(() => expect(ui.queryButton("Tech")).toBeInTheDocument());

      await user.keyboard("{Escape}");

      expect(await ui.search).toBe(field);
      expect(field).toHaveFocus();
      expect(ui.queryButton("Tech")).not.toBeInTheDocument();
    });

    it("clears the scope on Backspace at the start of the field", async () => {
      const { user } = setup({ tier: "desktop", streamKey: TECH_KEY });

      await user.click(await ui.search);
      await user.keyboard("{Backspace}");

      expect(await ui.text("received:all")).toBeInTheDocument();
    });

    it("drops the typed text when a matched category is picked", async () => {
      const { user, router, feedsLoaded } = setup({ tier: "desktop" });
      await waitFor(() => expect(ui.queryButton("Tech")).toBeInTheDocument());
      await feedsLoaded();

      await user.type(await ui.search, "tech");
      // The match row first, the tree row below it.
      const [matchRow] = await ui.rows("Tech");
      await user.click(matchRow);

      expect(await ui.text(`received:${TECH_KEY}`)).toBeInTheDocument();
      // The category rides in one path segment.
      expect(decodeURIComponent(router.state.location.pathname)).toBe(`/stream/${TECH_KEY}`);
    });

    it("activates the highlighted row with Space while browsing", async () => {
      const { user, feedsLoaded } = setup({ tier: "desktop" });
      await feedsLoaded();

      await user.click(await ui.search);
      await user.keyboard("{ArrowDown}{ArrowDown}[Space]");

      expect(await ui.text("received:read")).toBeInTheDocument();
    });
  });

  describe("when a row is picked", () => {
    it("opens All articles and Recently read on click", async () => {
      const { user, feedsLoaded } = setup({ streamKey: TECH_KEY });
      await feedsLoaded();

      await user.click(ui.allArticles!);

      expect(await ui.text("received:all")).toBeInTheDocument();
    });

    it("drops the typed text when All articles is picked", async () => {
      const { user, feedsLoaded } = setup({ streamKey: TECH_KEY });
      await feedsLoaded();

      await user.type(await ui.search, "tech");
      await user.click(ui.allArticles!);

      expect(await ui.text("received:all")).toBeInTheDocument();
      expect(await ui.search).toHaveValue("");
    });

    it("opens Recently read on click", async () => {
      const { user, feedsLoaded } = setup();
      await feedsLoaded();

      await user.click(ui.recentlyRead);

      expect(await ui.text("received:read")).toBeInTheDocument();
    });

    it("opens a category and one of its feeds on click", async () => {
      const { user, feedsLoaded, feedTitled } = setup();
      await feedsLoaded();

      await user.click(await ui.toggle("Tech"));
      await user.click(await ui.feedRow());
      const feed = feedTitled("Example Tech Daily");
      expect(
        await ui.text(`received:${toStreamKey({ kind: "feed", feedId: feed.id })}`),
      ).toBeInTheDocument();
    });

    it("opens a category on click", async () => {
      const { user, feedsLoaded } = setup();
      await feedsLoaded();

      await user.click(await ui.categoryRow());

      expect(await ui.text(`received:${TECH_KEY}`)).toBeInTheDocument();
    });

    it("opens the article search on click of its row", async () => {
      const { user, feedsLoaded } = setup();
      await feedsLoaded();

      await user.type(await ui.search, "tech");
      await user.click((await ui.searchRow("tech"))!);

      expect(await ui.text("received:all?q=tech")).toBeInTheDocument();
    });

    it("opens a matched feed on click, dropping the text", async () => {
      const { user, router, feedsLoaded } = setup();
      await feedsLoaded();

      await user.type(await ui.search, "Example Tech Daily");
      const [matchRow] = await ui.rows(/^Example Tech Daily/);
      await user.click(matchRow);

      await waitFor(() => {
        expect(decodeURIComponent(router.state.location.pathname)).toBe(`/stream/${FEED_KEY}`);
      });
      expect(router.state.location.search).toEqual({});
    });

    it("opens the feed behind a highlighted match with Enter", async () => {
      const { user, router, feedsLoaded } = setup();
      await feedsLoaded();

      await user.type(await ui.search, "Example Tech Daily");
      await user.keyboard("{ArrowDown}{Enter}");

      await waitFor(() => {
        expect(decodeURIComponent(router.state.location.pathname)).toBe(`/stream/${FEED_KEY}`);
      });
    });
  });

  describe("when the tree is walked with the keyboard", () => {
    it("expands a group with ArrowRight, then steps into it and out again", async () => {
      const { user, feedsLoaded } = setup();
      await feedsLoaded();

      await user.click(await ui.search);
      await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}");
      await waitFor(() => expect(ui.queryButton("Example Tech Daily")).toBeInTheDocument());

      await user.keyboard("{ArrowRight}");
      await waitFor(() => expect(ui.selected).toHaveTextContent("Example Tech Daily"));

      await user.keyboard("{ArrowUp}{ArrowLeft}");
      await waitFor(() => expect(ui.queryButton("Example Tech Daily")).not.toBeInTheDocument());
    });

    it("expands a group with ArrowRight, and leaves a feed row with Enter", async () => {
      const { user, feedsLoaded, feedTitled } = setup();
      await feedsLoaded();

      await user.click(await ui.search);
      await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}");
      await waitFor(() => expect(ui.queryButton("Example Tech Daily")).toBeInTheDocument());
      await user.keyboard("{ArrowRight}{Enter}");

      const feed = feedTitled("Example Tech Daily");
      expect(
        await ui.text(`received:${toStreamKey({ kind: "feed", feedId: feed.id })}`),
      ).toBeInTheDocument();
    });

    it("ignores ArrowLeft and ArrowRight on a built-in row", async () => {
      const { user, feedsLoaded } = setup();
      await feedsLoaded();

      await user.click(await ui.search);
      await user.keyboard("{ArrowDown}{ArrowRight}{ArrowLeft}");

      expect(ui.selected).toHaveTextContent("All articles");
    });

    it("marks the current feed once its group is open", async () => {
      const { user, feedsLoaded } = setup({ streamKey: FEED_KEY });
      await feedsLoaded();

      await user.click(await ui.toggle("Tech"));

      const row = await ui.feedRow();
      expect(row.closest("[data-current]")).not.toBeNull();
    });
  });

  describe("when the sheet's field is used", () => {
    it("clears the text from its button, keeping the field focused", async () => {
      const { user } = setup();

      const field = await ui.search;
      await user.type(field, "tech");
      await user.click(ui.clearText);

      expect(field).toHaveValue("");
      expect(field).toHaveFocus();
    });

    it("clears the scope on Backspace at the start of the field", async () => {
      const { user } = setup({ streamKey: TECH_KEY });

      await user.click(await ui.search);
      await user.keyboard("{Backspace}");

      expect(await ui.text("received:all")).toBeInTheDocument();
    });
  });

  describe("when the sheet is handled", () => {
    it("closes on a click of its backdrop", async () => {
      setup();
      await waitFor(() => expect(ui.allArticles).toBeInTheDocument());
      const dialog = ui.dialog!;

      fireEvent.click(dialog);

      expect(dialog).not.toHaveAttribute("open");
    });

    it("closes when the dialog reports a native close", async () => {
      setup();
      await waitFor(() => expect(ui.allArticles).toBeInTheDocument());
      const dialog = ui.dialog!;

      fireEvent(dialog, new Event("close"));

      expect(dialog).not.toHaveAttribute("open");
    });

    it("springs back from a short swipe", async () => {
      setup();
      await waitFor(() => expect(ui.allArticles).toBeInTheDocument());
      const dialog = ui.dialog!;

      ui.swipe({ target: ui.allArticles!, from: 300, to: 340 });

      expect(dialog).toHaveAttribute("open");
      expect(dialog.style.translate).toBe("0 0px");
      fireEvent(dialog, new Event("transitionend"));
      expect(dialog.style.translate).toBe("");
    });

    it("leaves a swipe towards the bar to the list", async () => {
      setup();
      await waitFor(() => expect(ui.allArticles).toBeInTheDocument());
      const dialog = ui.dialog!;

      ui.swipe({ target: ui.allArticles!, from: 300, to: 250 });

      expect(dialog).toHaveAttribute("open");
      expect(dialog.style.translate).toBe("");
    });

    it("fits the sheet above the keyboard when the bar is at the bottom", async () => {
      const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 700 });
      vi.stubGlobal("visualViewport", viewport);
      setup({ barPosition: "bottom" });
      await waitFor(() => expect(ui.allArticles).toBeInTheDocument());
      const dialog = ui.dialog!;
      expect(dialog.style.height).toBe("700px");
      expect(dialog).not.toHaveAttribute("data-keyboard");

      viewport.height = 300;
      act(() => {
        viewport.dispatchEvent(new Event("resize"));
      });

      expect(dialog.style.height).toBe("300px");
      expect(dialog).toHaveAttribute("data-keyboard");

      viewport.height = 700;
      act(() => {
        viewport.dispatchEvent(new Event("resize"));
      });
      expect(dialog).not.toHaveAttribute("data-keyboard");
    });
  });

  describe("when the app bar is at the bottom", () => {
    it("stands the popover on the location pill instead of hanging it below", async () => {
      setup({ tier: "desktop", barPosition: "bottom" });
      await waitFor(() => expect(ui.queryButton("Tech")).toBeInTheDocument());

      // jsdom measures the pill as a zero box at the origin, so its top edge is the viewport's.
      expect(ui.popover.style.bottom).toBe(`${window.innerHeight + POPOVER_GAP}px`);
      expect(ui.popover.style.top).toBe("");
    });

    it("puts the sheet's field below the results", async () => {
      setup({ barPosition: "bottom" });
      await waitFor(() => expect(ui.dialog).toBeInTheDocument());

      const field = await ui.search;
      await waitFor(() => expect(ui.allArticles).toBeInTheDocument());
      // The field follows the panel's first row in the DOM, so the reading order matches the paint.
      expect(
        ui.allArticles!.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
    });

    it("closes the sheet on a swipe up, and leaves it open on a swipe down", async () => {
      setup({ barPosition: "bottom" });
      await waitFor(() => expect(ui.allArticles).toBeInTheDocument());
      const dialog = ui.dialog!;
      const row = ui.allArticles!;

      ui.swipe({ target: row, from: 300, to: 420 });

      expect(dialog).toHaveAttribute("open");
      expect(ui.allArticles).toBeInTheDocument();

      ui.swipe({ target: row, from: 300, to: 180 });

      expect(dialog).not.toHaveAttribute("open");
      expect(ui.allArticles).not.toBeInTheDocument();
    });
  });

  describe("when the app bar is at the top", () => {
    it("closes the sheet on a swipe down, and leaves it open on a swipe up", async () => {
      setup();
      await waitFor(() => expect(ui.allArticles).toBeInTheDocument());
      const dialog = ui.dialog!;
      const row = ui.allArticles!;

      ui.swipe({ target: row, from: 300, to: 180 });

      expect(dialog).toHaveAttribute("open");
      expect(ui.allArticles).toBeInTheDocument();

      ui.swipe({ target: row, from: 300, to: 420 });

      expect(dialog).not.toHaveAttribute("open");
      expect(ui.allArticles).not.toBeInTheDocument();
    });
  });
});
