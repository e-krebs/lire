import { act, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { getFeeds, getProfile } from "client/api/client";
import { keys } from "client/api/queries";
import { renderApp } from "test/renderApp";

const ui = {
  get loadingArticles() {
    return screen.findByRole("status", { name: "Loading articles" });
  },
  get articleRegion() {
    return screen.findByRole("region", { name: "Article" });
  },
  async articleLink() {
    return within(await ui.articleRegion).findByRole("link", {
      name: "A deliberately long article title that goes on well past the usual width of a header to test wrapping and the sticky title",
    });
  },
};

// jsdom has no IntersectionObserver; the grid only uses it to page in more entries.
class NoIntersectionObserver {
  observe(): void {}
  disconnect(): void {}
}

const setup = ({ url }: { url: string }) => renderApp({ url });

const leafMatch = (router: ReturnType<typeof renderApp>["router"]) => router.state.matches.at(-1);

describe("/stream/$streamKey", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_MODE", "mock");
    vi.stubGlobal("IntersectionObserver", NoIntersectionObserver);
    resetFixtureState();
  });

  describe("when a category label has a % and a space in it", () => {
    // TanStack Router must own the encode/decode round trip, since the app no longer calls
    // encodeURIComponent/decodeURIComponent on stream params (see TopBar.tsx, this route).
    it("carries a key with a % and a space through a navigation to useParams unchanged", async () => {
      const streamKey = "folder:100% Design & Code";
      const { router } = setup({ url: "/stream/all" });

      await router.navigate({ to: "/stream/$streamKey", params: { streamKey } });

      await waitFor(() => {
        expect(leafMatch(router)?.params).toEqual({ streamKey });
      });
      expect(decodeURIComponent(router.state.location.pathname)).toBe(`/stream/${streamKey}`);
    });
  });

  it("redirects a key that names no stream to all", async () => {
    const { router } = setup({ url: "/stream/folder:" });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/stream/all");
    });
  });

  describe("when the selected feed is not in the feeds list", () => {
    it("replaces the stream with all", async () => {
      const { router } = setup({ url: "/stream/feed:999999" });

      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/stream/all");
      });
    });

    it("keeps a feed that is in the list", async () => {
      const { router, view } = setup({ url: "/stream/feed:101" });

      await waitFor(() => {
        expect(view.container.querySelector("[data-entry-id]")).not.toBeNull();
      });
      expect(router.state.location.pathname).toBe("/stream/feed:101");
    });

    it("waits for the feeds list to load", async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      queryClient.setQueryDefaults(keys.feeds, { enabled: false });
      const { router } = renderApp({ url: "/stream/feed:999999", queryClient });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(router.state.location.pathname).toBe("/stream/feed:999999");

      await act(async () => {
        await queryClient.query({ queryKey: keys.feeds, queryFn: getFeeds });
      });
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/stream/all");
      });
    });

    it("waits for a refetch before redirecting on a stale cached list", async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const feeds = await getFeeds();
      queryClient.setQueryData(
        keys.feeds,
        feeds.filter((feed) => feed.id !== "101"),
      );
      const { router } = renderApp({ url: "/stream/feed:101", queryClient });

      await waitFor(() => {
        expect(queryClient.isFetching({ queryKey: keys.feeds })).toBe(1);
      });
      expect(router.state.location.pathname).toBe("/stream/feed:101");

      await waitFor(() => {
        expect(queryClient.isFetching({ queryKey: keys.feeds })).toBe(0);
      });
      expect(router.state.location.pathname).toBe("/stream/feed:101");
    });
  });

  describe("when the url carries search params", () => {
    it("parses unread, ranked and q from the search", async () => {
      const { router } = setup({ url: "/stream/all?unread=false&ranked=oldest&q=chip" });

      await waitFor(() => {
        expect(leafMatch(router)?.search).toEqual({ unread: false, ranked: "oldest", q: "chip" });
      });
    });

    it("drops a blank search", async () => {
      const { router } = setup({ url: "/stream/all?q=%20" });

      await waitFor(() => {
        expect(leafMatch(router)?.routeId).toBe("/stream/$streamKey");
      });
      expect(leafMatch(router)?.search).toEqual({ q: undefined });
    });
  });

  it("shows the skeleton until the profile loads, then the grid", async () => {
    // Held back so the skeleton does not depend on the fixture's latency.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryDefaults(keys.profile, { enabled: false });
    const { view } = renderApp({ url: "/stream/all", queryClient });

    expect(await ui.loadingArticles).toBeInTheDocument();
    expect(queryClient.getQueryState(keys.profile)?.status).toBe("pending");

    await act(async () => {
      await queryClient.query({ queryKey: keys.profile, queryFn: getProfile });
    });
    await waitFor(() => {
      expect(view.container.querySelector("[data-entry-id]")).not.toBeNull();
    });
  });

  it("renders the read stream", async () => {
    const { view } = setup({ url: "/stream/read" });

    await waitFor(() => {
      expect(view.container.querySelector("[data-entry-id]")).not.toBeNull();
    });
  });

  describe("when opening an entry", () => {
    it("renders the reader beside the grid", async () => {
      const { view } = setup({ url: "/stream/all/entry/101:0dcd64" });

      // The grid tile carries the same title, so the reader's link is looked up inside its region.
      expect(await ui.articleLink()).toBeInTheDocument();
      await waitFor(() => {
        expect(view.container.querySelector('[data-entry-id="101:0dcd64"]')).not.toBeNull();
      });
    });
  });
});
