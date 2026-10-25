import { render, waitFor, type RenderResult } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { keys } from "client/api/keys";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";
import { MosaicGrid } from "../MosaicGrid";

const ui = (view: RenderResult) => ({
  get welcome() {
    return view.findByText("Welcome to Lire.", {}, { timeout: 5000 });
  },
  get noWelcome() {
    return view.queryByText("Welcome to Lire.");
  },
  get emptyMessage() {
    return view.findByText("Nothing to read here.");
  },
  get noEmptyMessage() {
    return view.queryByText("Nothing to read here.");
  },
  get addFirstFeedLink() {
    return view.getByRole("link", { name: "Add a first feed" });
  },
  get noAddFirstFeedLink() {
    return view.queryByRole("link", { name: "Add a first feed" });
  },
  get newsletterLink() {
    return view.getByRole("link", { name: "Get your newsletter address" });
  },
  get showAllLink() {
    return view.queryByRole("link", { name: "Show all articles" });
  },
});

// A stream with no entries: the fixture answers `feed:999` empty.
const renderEmptyStream = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const streamRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <MosaicGrid streamKey="feed:999" unreadOnly={false} ranked="newest" />,
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
  await waitFor(() => {
    expect(client.getQueryState(keys.feeds)?.status).not.toBe("pending");
  });
  return view;
};

describe("MosaicBody with an empty stream", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_MODE", "real");
    server.use(fixtureBackend);
    resetFixtureState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("welcomes an account with no subscriptions and links to adding one", async () => {
    server.use(http.get("/api/feeds", () => HttpResponse.json([])));
    const pageUi = ui(await renderEmptyStream());

    expect(await pageUi.welcome).toBeInTheDocument();
    expect(pageUi.noEmptyMessage).toBeNull();
    expect(pageUi.addFirstFeedLink).toHaveAttribute("href", "/subscriptions?add=true");
    expect(pageUi.newsletterLink).toHaveAttribute("href", "/subscriptions?newsletter=true");
    expect(pageUi.showAllLink).toBeNull();
  });

  it("keeps the plain empty view when subscriptions exist", async () => {
    const pageUi = ui(await renderEmptyStream());

    expect(await pageUi.emptyMessage).toBeInTheDocument();
    expect(pageUi.noWelcome).toBeNull();
    expect(pageUi.noAddFirstFeedLink).toBeNull();
    expect(pageUi.showAllLink).toBeInTheDocument();
  });

  it("keeps the plain empty view when the feeds request fails", async () => {
    server.use(http.get("/api/feeds", () => HttpResponse.json({ error: "boom" }, { status: 500 })));
    const pageUi = ui(await renderEmptyStream());

    expect(await pageUi.emptyMessage).toBeInTheDocument();
    expect(pageUi.noWelcome).toBeNull();
  });
});
