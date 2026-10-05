import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import {
  createCategory,
  deleteCategory,
  getCategories,
  getFeeds,
  updateFeed,
  updatePreferences,
} from "client/api/client";
import { keys } from "client/api/queries";
import { useDirectOpen } from "client/hooks/useDirectOpen";
import { Route as SubscriptionsRoute } from "client/routes/subscriptions";
import { fixtureBackend, logRequests } from "test/fixtureBackend";
import { server } from "test/msw";
import { CATEGORY_ORDER_KEY, directOpenKey } from "shared/feedsApi/preferences";
import { seedCategoryId } from "test/seedCategories";

// A mutation plus the refetch it invalidates stack two fixture latencies, past findBy's 1s default.
const SETTLED = { timeout: 3000 };
// A delete-and-move posts every feed one after another, then deletes and refetches.
const MOVED = { timeout: 6000 };

const TECH = seedCategoryId("Tech");
const DESIGN = seedCategoryId("Design");
const NEWS = seedCategoryId("News");
// Design's feeds that sit in no other category.
const DESIGN_ORPHANS = ["104", "105", "109"];
// "Example Daily News", filed in News only.
const DAILY_NEWS = "106";
// "Example Dev Notes", filed in Tech and Design.
const DEV_NOTES = "103";

// dnd-kit's screen reader instructions, which describe every reorder handle.
const DRAG_INSTRUCTIONS =
  "To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item. Press space again to drop the item in its new position, or press escape to cancel.";
const HANDLE_OPTIONS = { description: DRAG_INSTRUCTIONS };

let requests: ReturnType<typeof logRequests>;

type Page = Awaited<ReturnType<typeof setup>>;

const ui = {
  // jsdom hides a closed popover from the accessibility tree and never opens it.
  menuItem({ scope, name }: { scope: HTMLElement; name: string }) {
    return within(scope).getByRole("button", { name, hidden: true });
  },
  async tab(name: string) {
    return screen.findByRole("tab", { name });
  },
  async textbox(name: string) {
    return screen.findByRole("textbox", { name });
  },
  async search(name: string) {
    return screen.findByRole("searchbox", { name });
  },
  async findPanel(name: string) {
    return screen.findByRole("complementary", { name });
  },
  queryRow(title: string) {
    return screen.queryByRole("button", { name: title });
  },
  async openFeedsTab(page: Page) {
    await page.user.click(await ui.tab("Feeds · 12"));
  },
  async text(text: string) {
    return screen.findByText(text);
  },
  get handles() {
    return screen.queryAllByRole("button", HANDLE_OPTIONS);
  },
  get loadingCategories() {
    return screen.queryByRole("status", { name: "Loading categories" });
  },
  get alert() {
    return screen.findByRole("alert", undefined, SETTLED);
  },
  // The open panel, read afresh on each query.
  panel: {
    get panel() {
      return screen.queryByRole("complementary")!;
    },
    queryRow(title: string) {
      return within(this.panel).queryByRole("button", { name: title });
    },
    async open({ page, label }: { page: Page; label: string }) {
      await waitFor(() => expect(ui.queryRow(label)).toBeInTheDocument());
      await page.user.click(ui.queryRow(label)!);
      await ui.findPanel(label);
      return this;
    },
    async openFeed({ page, title }: { page: Page; title: string }) {
      await ui.openFeedsTab(page);
      const panel = await this.open({ page, label: title });
      // The feeds can land before the categories, which the picker lists.
      await waitFor(() => panel.checkbox("Newsletters"));
      return panel;
    },
    async createPodcasts(page: Page) {
      await waitFor(() => expect(ui.queryRow("＋ New")).toBeInTheDocument());
      await page.user.click(ui.queryRow("＋ New")!);
      await page.user.type(await ui.textbox("New category name"), "Podcasts");
      await waitFor(() => expect(ui.queryRow("Create category")).toBeInTheDocument());
      await page.user.click(ui.queryRow("Create category")!);
      await ui.findPanel("Podcasts");
      return this;
    },
    checkbox(name: string) {
      return within(this.panel).getByRole("checkbox", { name });
    },
    async findRadio(name: string) {
      return within(this.panel).findByRole("radio", { name }, SETTLED);
    },
    textbox(name: string) {
      return within(this.panel).getByRole("textbox", { name });
    },
    searchbox(name: string) {
      return within(this.panel).getByRole("searchbox", { name });
    },
    text(text: string) {
      return within(this.panel).getByText(text);
    },
    get alert() {
      return within(this.panel).getByRole("alert");
    },
  },
  // The open dialog, read afresh on each query.
  dialog: {
    get dialog() {
      return screen.queryByRole("dialog")!;
    },
    button(name: string) {
      return within(this.dialog).getByRole("button", { name });
    },
    async openDelete({ page, label }: { page: Page; label: string }) {
      const panel = await ui.panel.open({ page, label });
      await page.user.click(panel.queryRow("Delete category…")!);
      return this;
    },
    checkbox(name: string) {
      return within(this.dialog).getByRole("checkbox", { name });
    },
    radio(name: string) {
      return within(this.dialog).getByRole("radio", { name });
    },
    searchbox(name: string) {
      return within(this.dialog).getByRole("searchbox", { name });
    },
    heading(name: string) {
      return within(this.dialog).getByRole("heading", { name });
    },
    text(text: string) {
      return within(this.dialog).getByText(text);
    },
  },
};

// Rendered without resetting the fixture, so a second mount reads what the first one wrote.
const mount = (url: string) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const rootRoute = createRootRoute();
  // The real route's search parsing and page, without the app shell the generated tree brings.
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/subscriptions",
      validateSearch: SubscriptionsRoute.options.validateSearch,
      component: SubscriptionsRoute.options.component,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  const view = render(wrapper({ children: <RouterProvider router={router} /> }));
  return { client, wrapper, router, view };
};

const setup = async ({
  url = "/subscriptions",
  seed,
}: { url?: string; seed?: () => Promise<void> } = {}) => {
  vi.stubEnv("VITE_API_MODE", "real");
  // jsdom has no popover API: the menu's hidePopover is stubbed, and its toggle never fires.
  HTMLElement.prototype.hidePopover = vi.fn<() => void>();
  server.use(fixtureBackend);
  resetFixtureState();
  requests = logRequests();
  await seed?.();
  requests.clear();

  const { client, wrapper, router, view } = mount(url);

  const settled = async () =>
    waitFor(() => {
      expect(client.isMutating()).toBe(0);
    }, SETTLED);

  const closed = async () =>
    waitFor(() => {
      expect(ui.panel.panel).not.toBeInTheDocument();
    }, SETTLED);

  return {
    client,
    router,
    wrapper,
    settled,
    closed,
    view,
    user: userEvent.setup(),
  };
};

type Method = "get" | "post" | "patch" | "delete";

// Without `status`, holds the path until release; the handler returns nothing, so the request
// falls through to fixtureBackend. With `status`, fails the path at once instead.
const intercept = ({
  method,
  path,
  status,
  once,
}: {
  method: Method;
  path: string;
  status?: number;
  once?: boolean;
}): (() => void) => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http[method](
      `/api${path}`,
      status === undefined
        ? async () => {
            await held;
          }
        : () => HttpResponse.json({}, { status }),
      { once },
    ),
  );
  return release;
};

const feedCategoryIds = async (feedId: string): Promise<string[] | undefined> =>
  (await getFeeds()).find((feed) => feed.id === feedId)?.categoryIds;

describe("SubscriptionsManager", () => {
  describe("when switching tabs and filtering", () => {
    it("opens on categories and writes the feeds tab to the search params", async () => {
      const { user, router } = await setup();

      expect(await ui.tab("Categories · 4")).toHaveAttribute("aria-selected", "true");
      await user.click(await ui.tab("Feeds · 12"));

      expect(await ui.tab("Feeds · 12")).toHaveAttribute("aria-selected", "true");
      expect(router.state.location.search).toMatchObject({ tab: "feeds" });
      expect(await ui.search("Filter feeds")).toBeInTheDocument();
    });

    it("filters the categories", async () => {
      const { user } = await setup();

      await waitFor(() => {
        expect(ui.queryRow("Design")).toBeInTheDocument();
      }, SETTLED);
      await user.type(await ui.search("Filter categories"), "letters");

      await waitFor(() => {
        expect(ui.queryRow("Newsletters")).toBeInTheDocument();
        expect(ui.queryRow("Design")).not.toBeInTheDocument();
      });
    });

    it("filters the feeds", async () => {
      const page = await setup();
      await ui.openFeedsTab(page);

      await waitFor(() => {
        expect(ui.queryRow("Example Daily News")).toBeInTheDocument();
      }, SETTLED);
      await page.user.type(await ui.search("Filter feeds"), "foundry");

      await waitFor(() => {
        expect(ui.queryRow("Example Type Foundry")).toBeInTheDocument();
        expect(ui.queryRow("Example Daily News")).not.toBeInTheDocument();
      });
      expect(await ui.text("12 feeds, 1 of them in more than one category")).toBeInTheDocument();
    });

    it("filters the feeds in a category panel", async () => {
      const page = await setup();

      const panel = await ui.panel.open({ page, label: "Tech" });
      await page.user.type(panel.searchbox("Filter feeds in Tech"), "frame");

      expect(panel.queryRow("Example Frameworks Weekly")).toBeInTheDocument();
      expect(panel.queryRow("Example Dev Notes")).not.toBeInTheDocument();
    });
  });

  describe("when laying out the list", () => {
    const column = async () => (await ui.tab("Categories · 4")).closest("div.flex-col")!;

    it("centres the list while no panel is open", async () => {
      await setup();

      expect(await column()).not.toHaveAttribute("data-panel-open");
    });

    it("left-aligns the list clear of the panel while one is open", async () => {
      const page = await setup();
      await page.user.click(await ui.tab("Feeds · 12"));
      await ui.panel.open({ page, label: "Example Daily News" });

      expect(await column()).toHaveAttribute("data-panel-open");
    });

    it("keeps the list clear of the panel until its exit has played", async () => {
      const page = await setup();
      await page.user.click(await ui.tab("Feeds · 12"));
      await ui.panel.open({ page, label: "Example Daily News" });
      let finishExit = (): void => {};
      const exit = new Promise<void>((resolve) => {
        finishExit = resolve;
      });
      // jsdom has no animations: hand the panel one that ends when the test says so.
      Object.defineProperty(HTMLElement.prototype, "getAnimations", {
        configurable: true,
        value: () => [{ finished: exit }],
      });

      await page.user.keyboard("{Escape}");

      await waitFor(() => expect(ui.panel.panel).toHaveAttribute("data-closing"));
      expect(await column()).toHaveAttribute("data-panel-open");
      finishExit();
      await page.closed();
      expect(await column()).not.toHaveAttribute("data-panel-open");
    });
  });

  describe("when reordering the categories", () => {
    const ROW_HEIGHT = 56;
    const order = () => {
      const current = ui.handles;
      if (current.length === 0) throw new Error("No handles yet");
      return current.map((handle) => handle.getAttribute("aria-label")?.replace("Reorder ", ""));
    };
    const preferencePosts = async () => requests.find({ method: "POST", path: "/api/preferences" });

    const pickUp = async ({ page, label }: { page: Page; label: string }) => {
      // jsdom lays nothing out, and the keyboard sensor moves by the rows' rects.
      for (const [index, handle] of ui.handles.entries()) {
        const row = handle.closest("li");
        if (!row) throw new Error("A handle sits outside its row");
        const top = index * ROW_HEIGHT;
        row.getBoundingClientRect = () =>
          ({
            x: 0,
            y: top,
            top,
            left: 0,
            right: 320,
            bottom: top + ROW_HEIGHT,
            width: 320,
            height: ROW_HEIGHT,
            toJSON: () => ({}),
          }) satisfies DOMRect;
      }
      await waitFor(() => expect(ui.queryRow(`Reorder ${label}`)).toBeInTheDocument());
      ui.queryRow(`Reorder ${label}`)!.focus();
      await page.user.keyboard(" ");
    };

    const moveDesignDown = async (page: Page) => {
      await pickUp({ page, label: "Design" });
      await page.user.keyboard("{ArrowDown}");
      await page.user.keyboard(" ");
    };

    it("holds the rows behind a placeholder until the stored order loads", async () => {
      let release = (): void => {};
      const stored = ["Newsletters", "News", "Design", "Tech"];
      const page = await setup({
        seed: async () => {
          await updatePreferences({
            [CATEGORY_ORDER_KEY]: JSON.stringify(stored.map(seedCategoryId)),
          });
          release = intercept({ method: "get", path: "/preferences" });
        },
      });

      await waitFor(() => {
        expect(page.client.getQueryState(keys.categories)?.status).toBe("success");
      }, SETTLED);
      expect(ui.loadingCategories).toHaveAttribute("aria-busy", "true");
      expect(ui.handles).toHaveLength(0);

      release();
      expect(await waitFor(order)).toEqual(stored);
      expect(ui.loadingCategories).not.toBeInTheDocument();
    });

    it("moves a category with the keyboard, and the order holds after a remount", async () => {
      const page = await setup();
      expect(await waitFor(order)).toEqual(["Tech", "Design", "News", "Newsletters"]);

      await moveDesignDown(page);

      await waitFor(() => {
        expect(order()).toEqual(["Tech", "News", "Design", "Newsletters"]);
      });
      await page.settled();
      const posts = await preferencePosts();
      expect(posts).toHaveLength(1);
      expect(posts[0]?.body).toEqual({
        [CATEGORY_ORDER_KEY]: JSON.stringify(
          ["Tech", "News", "Design", "Newsletters"].map(seedCategoryId),
        ),
      });

      page.view.unmount();
      mount("/subscriptions");
      // One loaded full-suite run read the API order here before the stored order.
      await waitFor(() => {
        expect(order()).toEqual(["Tech", "News", "Design", "Newsletters"]);
      });
    });

    it("hides the handles while the filter narrows the list", async () => {
      const page = await setup();

      await waitFor(() => {
        expect(ui.handles).toHaveLength(4);
      });
      await page.user.type(await ui.search("Filter categories"), "letters");

      await waitFor(() => {
        expect(ui.queryRow("Newsletters")).toBeInTheDocument();
      });
      expect(ui.handles).toHaveLength(0);
    });

    it("cancels a keyboard move on Escape and writes nothing", async () => {
      const page = await setup();
      await waitFor(() => {
        expect(ui.handles).not.toHaveLength(0);
      });

      await pickUp({ page, label: "Design" });
      await page.user.keyboard("{ArrowDown}");
      await page.user.keyboard("{Escape}");

      expect(await ui.text("Move cancelled. Design stays in place.")).toBeInTheDocument();
      expect(order()).toEqual(["Tech", "Design", "News", "Newsletters"]);
      await page.settled();
      expect(await preferencePosts()).toHaveLength(0);
    });

    it("says the order was not saved and restores it when the save fails", async () => {
      const page = await setup();
      await waitFor(() => {
        expect(ui.handles).not.toHaveLength(0);
      });
      intercept({ method: "post", path: "/preferences", status: 500 });

      await moveDesignDown(page);

      expect(await ui.alert).toHaveTextContent(/^Could not save the new order\./);
      expect(order()).toEqual(["Tech", "Design", "News", "Newsletters"]);
    });

    it("shows the new order on drop and holds the handles while it saves", async () => {
      const page = await setup();
      await waitFor(() => {
        expect(ui.handles).not.toHaveLength(0);
      });
      const release = intercept({ method: "post", path: "/preferences" });

      await pickUp({ page, label: "Design" });
      await page.user.keyboard("{ArrowDown}");
      // A synchronous drop, read back at once: the rows must not wait on the save to reorder.
      fireEvent.keyDown(ui.queryRow("Reorder Design")!, {
        key: " ",
        code: "Space",
      });
      expect(ui.handles.map((handle) => handle.getAttribute("aria-label"))).toEqual(
        ["Tech", "News", "Design", "Newsletters"].map((label) => `Reorder ${label}`),
      );
      await waitFor(() => {
        for (const handle of ui.handles) {
          expect(handle).toHaveAttribute("aria-disabled", "true");
        }
      });
      await pickUp({ page, label: "Tech" });
      await page.user.keyboard("{ArrowDown}");
      await page.user.keyboard(" ");

      release();
      await page.settled();
      expect(await preferencePosts()).toHaveLength(1);
      expect(order()).toEqual(["Tech", "News", "Design", "Newsletters"]);
      await waitFor(() => {
        expect(ui.queryRow("Reorder Tech")).toHaveAttribute("aria-disabled", "false");
      });
    });

    it("still holds the handles after a tab switch remounts the list mid-save", async () => {
      const page = await setup();
      await waitFor(() => {
        expect(ui.handles).not.toHaveLength(0);
      });
      const release = intercept({ method: "post", path: "/preferences" });

      await moveDesignDown(page);
      await ui.openFeedsTab(page);
      await page.user.click(await ui.tab("Categories · 4"));

      expect(await waitFor(order)).toEqual(["Tech", "News", "Design", "Newsletters"]);
      for (const handle of ui.handles) {
        expect(handle).toHaveAttribute("aria-disabled", "true");
      }
      await pickUp({ page, label: "Tech" });
      await page.user.keyboard("{ArrowDown}");
      await page.user.keyboard(" ");

      release();
      await page.settled();
      expect(await preferencePosts()).toHaveLength(1);
      expect(order()).toEqual(["Tech", "News", "Design", "Newsletters"]);
    });
  });

  describe("when a feed panel is open", () => {
    const feedPatches = async (feedId: string) =>
      requests.find({ method: "PATCH", path: `/api/feeds/${feedId}` });

    it("saves a new title and a new category set in one PATCH", async () => {
      const page = await setup();
      const panel = await ui.panel.openFeed({ page, title: "Example Daily News" });
      const { user } = page;
      expect(page.router.state.location.search).toMatchObject({ feed: DAILY_NEWS });

      const title = panel.textbox("Title");
      await user.clear(title);
      await user.type(title, "Example Daily");
      await user.click(panel.checkbox("Design"));
      requests.clear();
      await user.click(panel.queryRow("Save changes")!);

      await page.closed();
      const patches = await feedPatches(DAILY_NEWS);
      expect(patches).toHaveLength(1);
      expect(patches[0]?.body).toEqual({ title: "Example Daily", categoryIds: [NEWS, DESIGN] });
      await waitFor(() => {
        expect(ui.queryRow("Example Daily")).toHaveFocus();
      }, SETTLED);
    });

    it("keeps the panel open and shows the error when a save fails", async () => {
      const page = await setup();
      const panel = await ui.panel.openFeed({ page, title: "Example Daily News" });
      intercept({ method: "patch", path: "/feeds/*", status: 500 });

      await page.user.click(panel.queryRow("Save changes")!);

      expect(
        await waitFor(() => panel.text("Could not save this feed. API error (500)")),
      ).toBeInTheDocument();
      expect(await ui.findPanel("Example Daily News")).toBeInTheDocument();
    });

    it("drops the draft when Escape closes the panel", async () => {
      const page = await setup();
      const { user } = page;
      const panel = await ui.panel.openFeed({ page, title: "Example Daily News" });

      const title = panel.textbox("Title");
      await user.clear(title);
      await user.type(title, "Never saved{Escape}");

      await waitFor(() => {
        expect(ui.panel.panel).not.toBeInTheDocument();
      });
      expect(page.router.state.location.search).not.toHaveProperty("feed", DAILY_NEWS);
      const reopened = await ui.panel.open({ page, label: "Example Daily News" });
      expect(reopened.textbox("Title")).toHaveValue("Example Daily News");
    });

    it("keeps a category created from one feed out of the next feed's draft", async () => {
      const page = await setup();
      const { user } = page;
      const first = await ui.panel.openFeed({ page, title: "Example Daily News" });
      const release = intercept({ method: "post", path: "/categories" });

      await user.type(first.searchbox("Filter categories"), "Podcasts");
      await user.click(first.queryRow("Create “Podcasts”")!);
      const second = await ui.panel.open({ page, label: "Example World Desk" });
      release();

      expect(await waitFor(() => second.checkbox("Podcasts"))).not.toBeChecked();
      await page.settled();
      requests.clear();
      await user.click(second.queryRow("Save changes")!);

      await page.closed();
      const patches = await feedPatches("107");
      expect(patches[0]?.body).toMatchObject({ categoryIds: [NEWS] });
    });

    it("holds Unsubscribe while a save is pending", async () => {
      const page = await setup();
      const panel = await ui.panel.openFeed({ page, title: "Example Daily News" });
      const release = intercept({ method: "patch", path: "/feeds/*" });

      await page.user.click(panel.queryRow("Save changes")!);
      expect(panel.queryRow("Unsubscribe…")!).toBeDisabled();
      release();
      await page.closed();
    });

    it("turns Save into Unsubscribe once every box is cleared, behind the confirm", async () => {
      const page = await setup();
      const { user } = page;
      const panel = await ui.panel.openFeed({ page, title: "Example Daily News" });

      await user.click(panel.checkbox("News"));
      expect(panel.queryRow("Save changes")).not.toBeInTheDocument();
      await user.click(panel.queryRow("Unsubscribe…")!);

      const dialog = ui.dialog;
      expect(dialog.heading("Unsubscribe from Example Daily News?")).toBeVisible();
      await user.click(dialog.button("Unsubscribe"));

      await waitFor(() => {
        expect(ui.queryRow("Example Daily News")).not.toBeInTheDocument();
      }, SETTLED);
      expect(await ui.tab("Feeds · 11")).toBeInTheDocument();
      expect(await feedCategoryIds(DAILY_NEWS)).toBeUndefined();
    });

    it("flags one feed for its own site and leaves the other feeds alone", async () => {
      const page = await setup();
      const { user, settled, wrapper } = page;
      const panel = await ui.panel.openFeed({ page, title: "Example World Desk" });

      const toggle = panel.checkbox("Opens on its site");
      expect(toggle).not.toBeChecked();
      await user.click(toggle);
      await settled();
      expect(toggle).toBeChecked();
      expect(renderHook(() => useDirectOpen("107"), { wrapper }).result.current).toBe(true);
      const posts = await requests.find({ method: "POST", path: "/api/preferences" });
      expect(posts.map((post) => post.body)).toEqual([{ [directOpenKey("107")]: "visit" }]);

      const other = await ui.panel.open({ page, label: "Example Tech Daily" });
      expect(other.checkbox("Opens on its site")).not.toBeChecked();
    });

    it("refuses an empty title and keeps the panel open", async () => {
      const page = await setup();
      const panel = await ui.panel.openFeed({ page, title: "Example Daily News" });

      const title = panel.textbox("Title");
      await page.user.clear(title);
      await page.user.click(panel.queryRow("Save changes")!);

      expect(panel.alert).toHaveTextContent("Enter a title for this feed.");
      expect(title).toHaveFocus();
      expect(title).toHaveAttribute("aria-invalid", "true");
    });

    it("backs out of the unsubscribe confirm on Cancel", async () => {
      const page = await setup();
      const { user } = page;
      const panel = await ui.panel.openFeed({ page, title: "Example Daily News" });

      await user.click(panel.queryRow("Unsubscribe…")!);
      await user.click(ui.dialog.button("Cancel"));

      await waitFor(() => {
        expect(ui.dialog.dialog).not.toBeInTheDocument();
      });
      expect(await ui.findPanel("Example Daily News")).toBeInTheDocument();
      expect(await feedCategoryIds(DAILY_NEWS)).toEqual([NEWS]);
    });

    it("ticks a category created from the feed's picker", async () => {
      const page = await setup();
      const panel = await ui.panel.openFeed({ page, title: "Example Daily News" });

      await page.user.type(panel.searchbox("Filter categories"), "Podcasts");
      await page.user.click(panel.queryRow("Create “Podcasts”")!);

      expect(await waitFor(() => panel.checkbox("Podcasts"))).toBeChecked();
    });
  });

  describe("when a category panel is open", () => {
    const designUrl = `/subscriptions?category=${encodeURIComponent(DESIGN)}`;

    it("removes a feed from this category only with its ✕", async () => {
      const page = await setup({ url: designUrl });
      await ui.findPanel("Design");
      const panel = ui.panel;
      expect(panel.text("4 feeds").parentElement).toHaveTextContent(
        /^4 feeds · 1 also in another category$/,
      );

      await page.user.click(panel.queryRow("Remove Example Dev Notes from Design")!);

      await waitFor(() => {
        expect(panel.queryRow("Example Dev Notes")).not.toBeInTheDocument();
      }, SETTLED);
      expect(await feedCategoryIds(DEV_NOTES)).toEqual([TECH]);
    });

    it("asks before the ✕ on a feed's last category unsubscribes it", async () => {
      const { user } = await setup({ url: designUrl });
      await ui.findPanel("Design");
      const panel = ui.panel;

      await user.click(panel.queryRow("Remove Example Longform from Design")!);

      const dialog = ui.dialog;
      expect(dialog.heading("Unsubscribe from Example Longform?")).toBeVisible();
      await user.click(dialog.button("Unsubscribe"));

      await waitFor(() => {
        expect(panel.queryRow("Example Longform")).not.toBeInTheDocument();
      }, SETTLED);
      expect(await feedCategoryIds("109")).toBeUndefined();
    });

    it("renames a category and closes the panel", async () => {
      const page = await setup();

      const panel = await ui.panel.open({ page, label: "Design" });
      const name = panel.textbox("Name");
      await page.user.clear(name);
      await page.user.type(name, "Design & UX{Enter}");

      await page.closed();
      // The id is the label, so the renamed row remounts and focus has no row to return to.
      await waitFor(() => {
        expect(ui.queryRow("Design & UX")).toBeInTheDocument();
        expect(ui.queryRow("Design")).not.toBeInTheDocument();
      }, SETTLED);
    });

    it("refuses to rename a category to a label already taken", async () => {
      const page = await setup();

      const panel = await ui.panel.open({ page, label: "Design" });
      const name = panel.textbox("Name");
      await page.user.clear(name);
      await page.user.type(name, "Tech{Enter}");

      expect(ui.panel.alert).toHaveTextContent("A category with this name already exists.");
      expect(ui.queryRow("Design")).toBeInTheDocument();
    });

    it("locks the delete on the last category while it holds feeds", async () => {
      const { user } = await setup({
        // Design is left as the only category, with its four feeds.
        seed: async () => {
          for (const { id } of await getCategories())
            if (id !== DESIGN) await deleteCategory({ categoryId: id });
        },
        url: designUrl,
      });
      await ui.findPanel("Design");
      const panel = ui.panel;

      const remove = panel.queryRow("Delete category…")!;
      expect(remove).toHaveAttribute("aria-disabled", "true");
      expect(remove).toHaveAccessibleDescription("Its feeds have no other category to move to");
      expect(panel.text("✕ removes the feed from this category only.")).toBeInTheDocument();
      await user.click(remove);
      expect(ui.dialog.dialog).not.toBeInTheDocument();
    });

    it("keeps the delete on an empty last category", async () => {
      const page = await setup({
        seed: async () => {
          for (const { id } of await getCategories()) await deleteCategory({ categoryId: id });
        },
      });

      const panel = await ui.panel.createPodcasts(page);
      await page.user.click(panel.queryRow("Delete category…")!);

      expect(ui.dialog.dialog).toBeVisible();
    });

    it("creates a category from ＋ New and opens its empty panel", async () => {
      const page = await setup();

      const panel = await ui.panel.createPodcasts(page);

      expect(panel.text("No feeds in this category yet.")).toBeInTheDocument();
      expect(panel.text("No feed")).toBeInTheDocument();
      expect(panel.queryRow("＋ Add sources")!).toBeInTheDocument();
      expect(page.router.state.location.search).toHaveProperty("category");
    });
  });

  describe("when creating a category", () => {
    it("refuses a label already taken", async () => {
      const page = await setup();
      await waitFor(() => expect(ui.queryRow("＋ New")).toBeInTheDocument());

      await page.user.click(ui.queryRow("＋ New")!);
      await page.user.type(await ui.textbox("New category name"), "Tech{Enter}");

      expect(await ui.alert).toHaveTextContent("A category with this name already exists.");
    });
  });

  describe("when deleting a category", () => {
    it("keeps the button disabled until a target is picked, then moves the orphans", async () => {
      const page = await setup();
      const dialog = await ui.dialog.openDelete({ page, label: "Design" });

      const confirm = dialog.button("Delete and move 3 feeds");
      expect(confirm).toBeDisabled();
      await page.user.click(dialog.radio("News"));
      expect(confirm).toBeEnabled();
      await page.user.click(confirm);

      await waitFor(() => {
        expect(ui.queryRow("Design")).not.toBeInTheDocument();
      }, MOVED);
      for (const feedId of DESIGN_ORPHANS) expect(await feedCategoryIds(feedId)).toEqual([NEWS]);
      expect(await feedCategoryIds(DEV_NOTES)).toEqual([TECH]);
    }, 10_000);

    it("also moves the feeds in another category once the checkbox is ticked", async () => {
      const page = await setup();
      const { user } = page;
      const dialog = await ui.dialog.openDelete({ page, label: "Design" });

      expect(dialog.button("Delete and move 3 feeds")).toBeInTheDocument();
      await user.click(dialog.checkbox("Also move the feed that sits in another category"));
      await user.click(dialog.radio("News"));
      requests.clear();
      await user.click(dialog.button("Delete and move 4 feeds"));

      await waitFor(() => {
        expect(ui.queryRow("Design")).not.toBeInTheDocument();
      }, MOVED);
      const ids = await feedCategoryIds(DEV_NOTES);
      expect(ids).toContain(TECH);
      expect(ids).toContain(NEWS);
      expect(ids).not.toContain(DESIGN);
      expect(ids).toHaveLength(2);
      expect(
        await requests.find({ method: "DELETE", path: `/api/categories/${DESIGN}` }),
      ).toHaveLength(1);
      expect(await requests.find({ method: "PATCH" })).toHaveLength(0);
    }, 10_000);

    it("stays open and says how many feeds moved when a move fails partway", async () => {
      const page = await setup();
      const { user } = page;
      const dialog = await ui.dialog.openDelete({ page, label: "Design" });
      let patches = 0;
      server.use(
        http.patch("/api/feeds/*", () => {
          patches += 1;
          return patches === 2 ? HttpResponse.json({}, { status: 500 }) : undefined;
        }),
      );

      await user.click(dialog.radio("News"));
      await user.click(dialog.button("Delete and move 3 feeds"));

      expect(
        await waitFor(() =>
          dialog.text(
            "Moved 1 feed, then one move failed. API error (500) Design is still here, so trying again is safe.",
          ),
        ),
      ).toBeInTheDocument();
      expect(ui.dialog.dialog).toBeVisible();
      expect(await requests.find({ method: "DELETE" })).toHaveLength(0);
    }, 10_000);

    it("deletes a category whose feeds all sit elsewhere without a move", async () => {
      const page = await setup({
        seed: async () => {
          const podcasts = await createCategory("Podcasts");
          await updateFeed({ feedId: DAILY_NEWS, categoryIds: [NEWS, podcasts.id] });
        },
      });
      const dialog = await ui.dialog.openDelete({ page, label: "Podcasts" });

      expect(
        dialog.text("Its one feed sits in another category and only loses this one."),
      ).toBeInTheDocument();
      await page.user.click(dialog.button("Delete category"));

      await waitFor(() => {
        expect(ui.queryRow("Podcasts")).not.toBeInTheDocument();
      }, SETTLED);
      expect(await feedCategoryIds(DAILY_NEWS)).toEqual([NEWS]);
    });

    it("picks a category created from the modal as the move target", async () => {
      const page = await setup();
      const dialog = await ui.dialog.openDelete({ page, label: "Design" });

      await page.user.type(dialog.searchbox("Filter categories"), "Podcasts");
      await page.user.click(dialog.button("Create “Podcasts”"));

      expect(await waitFor(() => dialog.radio("Podcasts"))).toBeChecked();
      expect(dialog.button("Delete and move 3 feeds")).toBeEnabled();
    });

    it("cancels, then reports a failed delete, then deletes an empty category", async () => {
      const page = await setup();
      const { user } = page;
      const panel = await ui.panel.createPodcasts(page);

      await user.click(panel.queryRow("Delete category…")!);
      await user.click(ui.dialog.button("Cancel"));
      await waitFor(() => {
        expect(ui.dialog.dialog).not.toBeInTheDocument();
      });
      expect(await ui.findPanel("Podcasts")).toBeInTheDocument();

      intercept({ method: "delete", path: "/categories/*", status: 500, once: true });
      await user.click(panel.queryRow("Delete category…")!);
      const dialog = ui.dialog;
      await user.click(dialog.button("Delete category"));
      expect(
        await waitFor(() => dialog.text("Could not delete Podcasts. API error (500)")),
      ).toBeInTheDocument();

      await user.click(dialog.button("Delete category"));
      await page.closed();
      await waitFor(() => {
        expect(ui.queryRow("Podcasts")).not.toBeInTheDocument();
      }, SETTLED);
    });
  });

  describe("when adding sources", () => {
    it("opens the newsletter panel from a category panel", async () => {
      const page = await setup();
      await ui.panel.open({ page, label: "Design" });

      await page.user.click(ui.menuItem({ scope: document.body, name: "Add newsletter" }));
      await ui.findPanel("Add a newsletter");

      expect(page.router.state.location.search).toMatchObject({ newsletter: DESIGN });
    });

    it("opens the newsletter panel from the Feeds tab", async () => {
      const page = await setup();
      await ui.openFeedsTab(page);
      await waitFor(() => expect(ui.queryRow("Add newsletter")).toBeInTheDocument());

      await page.user.click(ui.menuItem({ scope: document.body, name: "Add newsletter" }));
      await ui.findPanel("Add a newsletter");

      expect(page.router.state.location.search).toMatchObject({ newsletter: true });
    });

    it("opens the website panel from an empty category panel", async () => {
      const page = await setup();
      await ui.panel.createPodcasts(page);

      await page.user.click(ui.menuItem({ scope: document.body, name: "Add website" }));
      await ui.findPanel("Add a feed");

      expect(page.router.state.location.search).toHaveProperty("add");
    });

    it("opens the newsletter panel from an empty category panel", async () => {
      const page = await setup();
      await ui.panel.createPodcasts(page);

      await page.user.click(ui.menuItem({ scope: document.body, name: "Add newsletter" }));
      await ui.findPanel("Add a newsletter");

      expect(page.router.state.location.search).toHaveProperty("newsletter");
    });

    it("opens the website panel from a category panel", async () => {
      const page = await setup();
      await ui.panel.open({ page, label: "Design" });

      await page.user.click(ui.menuItem({ scope: document.body, name: "Add website" }));
      await ui.findPanel("Add a feed");

      expect(page.router.state.location.search).toMatchObject({ add: DESIGN });
    });
  });

  describe("when subscribing to a feed", () => {
    it("keeps Subscribe disabled until a category is picked, and subscribes into a created one", async () => {
      const page = await setup();
      const { user } = page;
      await ui.openFeedsTab(page);
      await waitFor(() => expect(ui.queryRow("Add website")).toBeInTheDocument());
      await user.click(ui.menuItem({ scope: document.body, name: "Add website" }));
      await ui.findPanel("Add a feed");
      const panel = ui.panel;
      expect(page.router.state.location.search).toMatchObject({ add: true });

      await user.type(panel.textbox("Feed or site URL"), "gardening.example.test");
      await user.click(await panel.findRadio("Example Gardeninggardening.example.test"));
      const subscribe = panel.queryRow("Subscribe")!;
      expect(subscribe).toBeDisabled();

      await user.type(panel.searchbox("Filter categories"), "Podcasts");
      await user.click(panel.queryRow("Create “Podcasts”")!);
      expect(await waitFor(() => panel.checkbox("Podcasts"))).toBeChecked();
      expect(subscribe).toBeEnabled();
      requests.clear();
      await user.click(subscribe);

      await waitFor(() => {
        expect(ui.queryRow("Example Gardening")).toBeInTheDocument();
        expect(ui.panel.panel).not.toBeInTheDocument();
      }, SETTLED);
      const posts = await requests.find({ method: "POST", path: "/api/feeds" });
      expect(posts.map((post) => post.body)).toEqual([
        {
          feedUrl: "https://gardening.example.test/rss",
          title: "Example Gardening",
          categoryIds: ["Podcasts"],
        },
      ]);
      const created = (await getFeeds()).find((feed) => feed.title === "Example Gardening");
      expect(created?.categoryIds).toEqual(["Podcasts"]);
    }, 10_000);
  });
});
