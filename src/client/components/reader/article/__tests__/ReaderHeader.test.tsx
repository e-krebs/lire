import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import type { Entry } from "shared/feedsApi/types";
import { ReaderHeader } from "../ReaderHeader";

const ENTRY: Entry = {
  id: "101:entry1",
  feedId: "101",
  title: "A long read",
  published: Date.UTC(2026, 8, 1),
  unread: true,
  url: "https://example-news.test/a-long-read",
};

const ui = {
  get untitledHeading() {
    return screen.getByRole("heading", { name: "(untitled)" });
  },
  queryLinkNamed(name: RegExp) {
    return screen.queryByRole("link", { name });
  },
  async heading() {
    return screen.findByRole("heading");
  },
  async feedLink() {
    return screen.findByRole("link", { name: /^Open / });
  },
};

const setup = async ({
  entry = ENTRY,
  path = "/stream/all",
}: { entry?: Entry; path?: string } = {}) => {
  const onKeep = vi.fn<() => void>();
  const onMark = vi.fn<() => void>();
  const Pane = () => (
    <ReaderHeader entry={entry} minutes={0} openedUnread={true} onKeep={onKeep} onMark={onMark} />
  );
  const rootRoute = createRootRoute();
  const streamRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/stream/$streamKey",
    component: Pane,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([streamRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

describe("ReaderHeader", () => {
  it("shows a plain title without an original to link to", async () => {
    await setup({ entry: { ...ENTRY, url: undefined, title: undefined } });

    expect(ui.untitledHeading).toBeInTheDocument();
    expect(ui.queryLinkNamed(/^http|a-long-read/)).toBeNull();
  });

  it("links the feed name to its stream", async () => {
    await setup();

    expect(await ui.feedLink()).toHaveAttribute("href", "/stream/feed%3A101");
  });

  it("keeps the feed name plain on its own stream", async () => {
    await setup({ path: "/stream/feed:101" });

    await ui.heading();
    expect(ui.queryLinkNamed(/^Open /)).toBeNull();
  });
});
