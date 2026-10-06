import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

type Report = (records: Array<{ intersectionRatio: number; isIntersecting: boolean }>) => void;

const ui = {
  get untitledHeading() {
    return screen.getByRole("heading", { name: "(untitled)" });
  },
  get queryLink() {
    return screen.queryByRole("link");
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

const stubIntersectionObserver = () => {
  const observer = { report: undefined as Report | undefined, disconnect: vi.fn<() => void>() };
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: Report) {
        observer.report = callback;
      }
      observe(): void {}
      disconnect(): void {
        observer.disconnect();
      }
    },
  );
  return observer;
};

const setup = async ({
  entry = ENTRY,
  path = "/stream/all",
}: { entry?: Entry; path?: string } = {}) => {
  const paneRef = createRef<HTMLDivElement>();
  const onKeep = vi.fn<() => void>();
  const onMark = vi.fn<() => void>();
  const Pane = () => (
    <div ref={paneRef}>
      <ReaderHeader
        entry={entry}
        minutes={0}
        openedUnread={true}
        paneRef={paneRef}
        onKeep={onKeep}
        onMark={onMark}
      />
    </div>
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
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const head = () => view.container.querySelector(".reader-head");
  return { view, head };
};

describe("ReaderHeader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("condenses once the sentinel scrolls out and expands only back at the very top", async () => {
    const observer = stubIntersectionObserver();
    const { head } = await setup();
    const report = (record: { intersectionRatio: number; isIntersecting: boolean }): void => {
      act(() => {
        observer.report?.([record]);
      });
    };
    expect(head()).not.toHaveAttribute("data-condensed");

    report({ intersectionRatio: 0, isIntersecting: false });
    expect(head()).toHaveAttribute("data-condensed");

    // Partly back in view is the band in between: the state holds.
    report({ intersectionRatio: 0.5, isIntersecting: true });
    expect(head()).toHaveAttribute("data-condensed");

    act(() => {
      observer.report?.([]);
    });
    expect(head()).toHaveAttribute("data-condensed");

    report({ intersectionRatio: 1, isIntersecting: true });
    expect(head()).not.toHaveAttribute("data-condensed");
  });

  it("stops observing on unmount", async () => {
    const observer = stubIntersectionObserver();
    const { view } = await setup();

    view.unmount();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

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
