import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { renderApp } from "test/renderApp";

const FEED_ID = "feed/http://example-news.test/rss";

const ui = {
  get feedsTab() {
    return screen.findByRole("tab", { name: "Feeds · 9" });
  },
  get categoriesTab() {
    return screen.findByRole("tab", { name: "Categories · 4" });
  },
  get feedPanel() {
    return screen.findByRole("complementary", { name: "Example News" });
  },
  get feedRow() {
    return screen.findByRole("button", { name: "Example News" });
  },
};

const subscriptionsSearch = (router: ReturnType<typeof renderApp>["router"]) =>
  router.state.matches.at(-1)?.search;

describe("/subscriptions", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
  });

  it("parses the tab and opens the feeds tab", async () => {
    const { router } = renderApp({ url: "/subscriptions?tab=feeds" });

    expect(await ui.feedsTab).toHaveAttribute("aria-selected", "true");
    expect(subscriptionsSearch(router)).toMatchObject({ tab: "feeds" });
  });

  it("opens the feed panel the search names", async () => {
    const { router } = renderApp({
      url: `/subscriptions?tab=feeds&feed=${encodeURIComponent(JSON.stringify(FEED_ID))}`,
    });

    expect(await ui.feedPanel).toBeInTheDocument();
    expect(subscriptionsSearch(router)).toMatchObject({ tab: "feeds", feed: FEED_ID });
  });

  it("drops an unknown tab and keeps the add flag", async () => {
    const { router } = renderApp({ url: "/subscriptions?tab=nope&add=true" });

    await ui.categoriesTab;
    expect(subscriptionsSearch(router)).toMatchObject({ tab: undefined, add: true });
  });

  it("keeps the newsletter flag", async () => {
    const { router } = renderApp({ url: "/subscriptions?newsletter=true" });

    await ui.categoriesTab;
    expect(subscriptionsSearch(router)).toMatchObject({ newsletter: true });
  });

  it("keeps the newsletter category id", async () => {
    const { router } = renderApp({ url: "/subscriptions?newsletter=cat-1" });

    await ui.categoriesTab;
    expect(subscriptionsSearch(router)).toMatchObject({ newsletter: "cat-1" });
  });

  it("switches tab and closes the panel through the search", async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ url: "/subscriptions?tab=categories" });

    await user.click(await ui.feedsTab);
    await vi.waitFor(() => {
      expect(subscriptionsSearch(router)).toMatchObject({ tab: "feeds" });
    });

    await user.click(await ui.feedRow);
    await vi.waitFor(() => {
      expect(subscriptionsSearch(router)).toMatchObject({ feed: FEED_ID });
    });
  });
});
