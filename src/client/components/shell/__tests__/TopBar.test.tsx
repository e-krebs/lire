import { userEvent } from "@testing-library/user-event";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { useOverlay } from "client/hooks/useOverlay";
import { toStreamKey } from "shared/feedsApi/streamKey";
import { seedCategoryId, seedCategoryKey } from "test/seedCategories";
import { TopBar } from "../TopBar";

const ui = {
  get homeLink() {
    return screen.findByRole("link", { name: "Lire home" });
  },
  get searchField() {
    return screen.findByLabelText("Search articles and feeds");
  },
  get viewGroup() {
    return screen.findByRole("group", { name: "View" });
  },
  get accountButton() {
    return screen.findByRole("button", { name: "Account and app info" });
  },
  get backButton() {
    return screen.findByRole("button", { name: "Go back" });
  },
  get noViewGroup() {
    return screen.queryByRole("group", { name: "View" });
  },
  get unreadButton() {
    return screen.findByRole("button", { name: "Unread only" });
  },
  get oldestButton() {
    return screen.findByRole("button", { name: "Oldest first" });
  },
  get clearSearchButton() {
    return screen.findByRole("button", { name: "Clear search text" });
  },
  get navigatorButton() {
    return screen.getByRole("button", { name: "Open navigator" });
  },
  get editLinks() {
    return screen.queryAllByRole("link", { name: (name: string) => name.startsWith("Edit ") });
  },
  get locationGroup() {
    return screen.findByRole("group", { name: "Location" });
  },
  get bottomCheckbox() {
    return screen.getByRole("checkbox", { name: "Bar at the bottom", hidden: true });
  },
  get versionRow() {
    return screen.getByText("Version", { ignore: "button" });
  },
  get manageSubscriptionsLink() {
    return screen.getByRole("link", { name: "Manage subscriptions", hidden: true });
  },
  async editLink(name: string) {
    return screen.findByRole("link", { name: `Edit ${name}` });
  },
  async searchEverywhereButton(name: string) {
    return screen.findByRole("button", { name: `Search everywhere instead of ${name}` });
  },
  async locationEditLink(name: string) {
    const pill = within(await ui.locationGroup);
    return pill.findByRole("link", { name: `Edit ${name}` });
  },
};

// jsdom has no popover API, so the cog menu opens through the store instead of its trigger.
const OpenMenu = () => {
  useOverlay({ id: "account-menu", isOpen: true });
  return null;
};

// jsdom has no matchMedia either; a desktop stub keeps the pill an input with its toggles.
const stubTier = (tier: "desktop" | "phone"): void => {
  // oxlint-disable typescript/no-unsafe-type-assertion -- test stub: useTier only reads
  // `matches` and (de)registers listeners, never the rest of MediaQueryList.
  window.matchMedia = (query: string) =>
    ({
      matches: tier === "desktop",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
  // oxlint-enable typescript/no-unsafe-type-assertion
};

const setup = ({
  path,
  history = [path],
  menuOpen = false,
  tier = "desktop",
}: {
  path: string;
  history?: string[];
  menuOpen?: boolean;
  tier?: "desktop" | "phone";
}) => {
  vi.stubEnv("VITE_API_MODE", "mock");
  resetFixtureState();
  stubTier(tier);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <TopBar />
        {menuOpen ? <OpenMenu /> : null}
        <Outlet />
      </>
    ),
  });
  const streamRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/stream/$streamKey",
    component: () => null,
  });
  const subscriptionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/subscriptions",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([streamRoute, subscriptionsRoute]),
    history: createMemoryHistory({ initialEntries: history, initialIndex: history.length - 1 }),
  });

  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return Object.assign(view, { router });
};

const inert = (element: Element): boolean => element.closest("[inert]") !== null;

const TECH_PATH = `/stream/${encodeURIComponent(seedCategoryKey("Tech"))}`;
const FEED_ID = "101";
const FEED_PATH = `/stream/${encodeURIComponent(toStreamKey({ kind: "feed", feedId: FEED_ID }))}`;

const searchParamsOf = (link: HTMLElement): URLSearchParams =>
  new URL(link.getAttribute("href") ?? "", location.origin).searchParams;

describe("TopBar", () => {
  it("leaves every item live while nothing is open", async () => {
    setup({ path: TECH_PATH });

    expect(inert(await ui.homeLink)).toBe(false);
    expect(inert(await ui.searchField)).toBe(false);
    expect(inert(await ui.viewGroup)).toBe(false);
  });

  describe("when the account menu is open", () => {
    // jsdom has no popover API: the toggle event is fired by hand, and hidePopover is stubbed.
    const openMenu = async (view: ReturnType<typeof setup>) => {
      await ui.accountButton;
      const menu = view.container.querySelector<HTMLElement>("[popover]");
      if (!menu) throw new Error("no account menu popover");
      const toggle = Object.assign(new Event("toggle"), { newState: "open" });
      act(() => {
        menu.dispatchEvent(toggle);
      });
      expect(await ui.accountButton).toHaveAttribute("aria-expanded", "true");
      return menu;
    };

    it("keeps only the cog live", async () => {
      setup({ path: TECH_PATH, menuOpen: true });

      expect(inert(await ui.homeLink)).toBe(true);
      expect(inert(await ui.searchField)).toBe(true);
      expect(inert(await ui.accountButton)).toBe(false);
    });

    it("makes the Subscriptions Back button inert too", async () => {
      setup({ path: "/subscriptions", menuOpen: true });

      expect(inert(await ui.backButton)).toBe(true);
      expect(inert(await ui.accountButton)).toBe(false);
    });

    it("swallows the click of a press outside the open menu, not one inside it", async () => {
      const view = setup({ path: TECH_PATH });
      const menu = await openMenu(view);
      const outside = vi.fn<() => void>();
      const inside = vi.fn<() => void>();
      document.body.addEventListener("click", outside);
      menu.addEventListener("click", inside);

      fireEvent.pointerDown(menu);
      fireEvent.click(menu);
      expect(inside).toHaveBeenCalledTimes(1);

      fireEvent.pointerDown(await ui.accountButton);
      fireEvent.pointerDown(document.body);
      fireEvent.click(document.body);
      expect(outside).toHaveBeenCalledTimes(1);

      document.body.removeEventListener("click", outside);
    });

    it("moves the bar to the bottom and back", async () => {
      const view = setup({ path: TECH_PATH });
      const user = userEvent.setup();
      await openMenu(view);
      const bottom = ui.bottomCheckbox;

      await user.click(bottom);
      expect(document.documentElement.dataset.bar).toBe("bottom");

      await user.click(bottom);
      expect(document.documentElement.dataset.bar).toBeUndefined();
    });

    it("shows the app version", async () => {
      const view = setup({ path: TECH_PATH });
      await openMenu(view);

      expect(ui.versionRow.nextElementSibling).toHaveTextContent(/\S/);
    });

    it("closes the menu when it opens Subscriptions", async () => {
      const hidePopover = vi.fn<() => void>();
      HTMLElement.prototype.hidePopover = hidePopover;
      const view = setup({ path: TECH_PATH });
      const user = userEvent.setup();
      await openMenu(view);

      await user.click(ui.manageSubscriptionsLink);

      expect(hidePopover).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(view.router.state.location.pathname).toBe("/subscriptions");
      });
    });
  });

  describe("when the Navigator is open", () => {
    it("keeps only the search input live", async () => {
      setup({ path: TECH_PATH });
      const user = userEvent.setup();
      const field = await ui.searchField;
      await ui.oldestButton;

      await user.click(field);

      expect(inert(field)).toBe(false);
      expect(inert(await ui.accountButton)).toBe(true);
      expect(inert(await ui.searchEverywhereButton("Tech"))).toBe(true);
      expect(inert(await ui.viewGroup)).toBe(true);
      expect(inert(await ui.homeLink)).toBe(true);
      // The Navigator's rows carry edit links too, so look inside the pill.
      expect(inert(await ui.locationEditLink("Tech"))).toBe(true);
    });
  });

  describe("when viewing a feed stream", () => {
    it("opens the feed panel from the edit link", async () => {
      setup({ path: FEED_PATH });

      const params = searchParamsOf(await ui.editLink("Example Tech Daily"));
      expect(params.get("tab")).toBe("feeds");
      expect(params.get("feed")).toBe(JSON.stringify(FEED_ID));
    });
  });

  describe("when viewing a category stream", () => {
    it("opens the category panel from the edit link", async () => {
      setup({ path: TECH_PATH });

      const params = searchParamsOf(await ui.editLink("Tech"));
      expect(params.get("tab")).toBe("categories");
      expect(params.get("category")).toBe(seedCategoryId("Tech"));
    });
  });

  it.each(["all", "read"])("shows no edit link on the %s stream", async (streamKey) => {
    setup({ path: `/stream/${streamKey}` });

    await ui.homeLink;
    expect(ui.editLinks).toHaveLength(0);
  });

  it("shows no filter or sort control on the recently-read stream", async () => {
    setup({ path: "/stream/read" });

    await ui.homeLink;
    expect(ui.noViewGroup).not.toBeInTheDocument();
  });

  describe("when on a phone", () => {
    it("sits the edit link beside the pill's button, not inside it", async () => {
      setup({ path: FEED_PATH, tier: "phone" });

      const link = await ui.editLink("Example Tech Daily");
      expect(searchParamsOf(link).get("feed")).toBe(JSON.stringify(FEED_ID));
      expect(link.closest("button")).toBeNull();
      expect(ui.navigatorButton).toBeDefined();
    });
  });

  it("closes the Navigator on Escape and keeps focus in the field", async () => {
    setup({ path: TECH_PATH });
    const user = userEvent.setup();
    const field = await ui.searchField;
    const home = await ui.homeLink;

    await user.click(field);
    expect(inert(home)).toBe(true);
    await user.keyboard("{Escape}");

    expect(inert(home)).toBe(false);
    expect(field).toHaveFocus();
  });

  it("clears the typed text and drops the article search from the route", async () => {
    const view = setup({ path: `${TECH_PATH}?q=rust` });
    const user = userEvent.setup();
    const field = await ui.searchField;
    expect(field).toHaveValue("rust");

    await user.click(await ui.clearSearchButton);

    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    await waitFor(() => {
      expect(view.router.state.location.search).not.toHaveProperty("q");
    });
  });

  it("clears text that was only typed without touching the route", async () => {
    const view = setup({ path: TECH_PATH });
    const user = userEvent.setup();
    const field = await ui.searchField;

    await user.type(field, "draft");
    await user.click(await ui.clearSearchButton);

    expect(field).toHaveValue("");
    expect(view.router.state.location.pathname).toBe(TECH_PATH);
  });

  it("follows a navigation that changes the article search", async () => {
    const view = setup({ path: `${TECH_PATH}?q=rust` });
    const field = await ui.searchField;

    await act(async () => {
      await view.router.navigate({ to: ".", search: { q: "go" } });
    });

    expect(field).toHaveValue("go");
  });

  it("widens the scope to every stream, keeping the article search", async () => {
    const view = setup({ path: `${TECH_PATH}?q=rust` });
    const user = userEvent.setup();

    await user.click(await ui.searchEverywhereButton("Tech"));

    await waitFor(() => {
      expect(view.router.state.location.pathname).toBe("/stream/all");
    });
    expect(view.router.state.location.search).toMatchObject({ q: "rust" });
  });

  it("goes back through history when there is some", async () => {
    const view = setup({ path: "/subscriptions", history: [TECH_PATH, "/subscriptions"] });
    const user = userEvent.setup();

    await user.click(await ui.backButton);

    await waitFor(() => {
      expect(view.router.state.location.pathname).toBe(TECH_PATH);
    });
  });

  it("goes home when Subscriptions was the first page", async () => {
    const view = setup({ path: "/subscriptions" });
    const user = userEvent.setup();

    await user.click(await ui.backButton);

    await waitFor(() => {
      expect(view.router.state.location.pathname).toBe("/");
    });
  });

  it("toggles the unread filter and the sort order, kept on the device and out of the URL", async () => {
    const view = setup({ path: TECH_PATH });
    const user = userEvent.setup();
    const unread = await ui.unreadButton;
    const oldest = await ui.oldestButton;
    expect(unread).toHaveAttribute("aria-pressed", "true");
    expect(oldest).toHaveAttribute("aria-pressed", "false");

    await user.click(unread);
    await user.click(oldest);

    expect(unread).toHaveAttribute("aria-pressed", "false");
    expect(oldest).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(window.localStorage.getItem("lire.view") ?? "null")).toEqual({
      unread: false,
      ranked: "oldest",
    });
    expect(view.router.state.location.search).toEqual({});

    await user.click(oldest);
    expect(oldest).toHaveAttribute("aria-pressed", "false");
  });

  describe("when searching", () => {
    it("offers no sort order while searching", async () => {
      const view = setup({ path: `${TECH_PATH}?q=rust` });
      const user = userEvent.setup();
      const oldest = await ui.oldestButton;
      expect(oldest).toHaveAttribute("aria-disabled", "true");

      await user.click(oldest);

      expect(view.router.state.location.search).not.toHaveProperty("ranked");
    });
  });
});
