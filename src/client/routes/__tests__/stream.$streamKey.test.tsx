import { act, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { getProfile } from "client/api/client";
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
      name: "Chipmaker unveils next generation of low-power silicon",
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

  describe("when a collection label has a % and a space in it", () => {
    // TanStack Router must own the encode/decode round trip, since the app no longer calls
    // encodeURIComponent/decodeURIComponent on stream params (see TopBar.tsx, this route).
    it("carries a key with a % and a space through a navigation to useParams unchanged", async () => {
      const streamKey = "100% Design & Code";
      const { router } = setup({ url: "/stream/all" });

      await router.navigate({ to: "/stream/$streamKey", params: { streamKey } });

      await waitFor(() => {
        expect(leafMatch(router)?.params).toEqual({ streamKey });
      });
      expect(decodeURIComponent(router.state.location.pathname)).toBe(`/stream/${streamKey}`);
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
      const { view } = setup({ url: "/stream/all/entry/news-0029" });

      // The grid tile carries the same title, so the reader's link is looked up inside its region.
      expect(await ui.articleLink()).toBeInTheDocument();
      await waitFor(() => {
        expect(view.container.querySelector('[data-entry-id="news-0029"]')).not.toBeNull();
      });
    });
  });
});
