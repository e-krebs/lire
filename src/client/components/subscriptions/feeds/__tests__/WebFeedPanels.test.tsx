import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { getFeeds } from "client/api/client";
import { fixtureBackend, logRequests } from "test/fixtureBackend";
import { server } from "test/msw";
import { seedCategoryId } from "test/seedCategories";
import type { Category, Feed } from "shared/feedsApi/types";
import { FeedPanel } from "../FeedPanel";

const SETTLED = { timeout: 8000 };
const TECH = seedCategoryId("Tech");
const CATEGORIES: Category[] = [{ id: TECH, label: "Tech", feedIds: [] }];

let requests: ReturnType<typeof logRequests>;

const ui = {
  get panel() {
    return within(screen.getByRole("complementary"));
  },
  async findFeedPanel() {
    return screen.findByRole("complementary");
  },
  async findReanalyze() {
    return screen.findByRole("button", { name: "Reanalyze" });
  },
  queryReanalyze() {
    return screen.queryByRole("button", { name: "Reanalyze" });
  },
  async findVariant(name: string) {
    return this.panel.findByRole("radio", { name: new RegExp(name) }, SETTLED);
  },
};

const prepare = () => {
  vi.stubEnv("VITE_API_MODE", "real");
  server.use(fixtureBackend);
  resetFixtureState();
  requests = logRequests();
  return userEvent.setup();
};

const renderWithClient = (element: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
};

describe("web feed panels", { timeout: 20_000 }, () => {
  describe("when reanalyzing in the FeedPanel", () => {
    const webFeed = async (): Promise<Feed> => {
      const feed = (await getFeeds()).find((candidate) => candidate.isWebFeed);
      if (!feed) throw new Error("The seed has no web feed.");
      return feed;
    };

    it("shows Reanalyze on a web feed only", async () => {
      prepare();
      const plain = (await getFeeds()).find((candidate) => !candidate.isWebFeed)!;
      renderWithClient(
        <FeedPanel feed={plain} categories={CATEGORIES} onClose={vi.fn<() => void>()} />,
      );

      expect(await ui.findFeedPanel()).toBeInTheDocument();
      expect(ui.queryReanalyze()).toBeNull();
    });

    it("shows the opens-on-its-site switch except on a newsletter", async () => {
      prepare();
      const plain = (await getFeeds()).find((candidate) => !candidate.isWebFeed)!;
      const { unmount } = render(
        <QueryClientProvider client={new QueryClient()}>
          <FeedPanel feed={plain} categories={CATEGORIES} onClose={vi.fn<() => void>()} />
        </QueryClientProvider>,
      );
      expect(await ui.findFeedPanel()).toBeInTheDocument();
      expect(ui.panel.getByRole("checkbox", { name: "Opens on its site" })).toBeInTheDocument();
      unmount();

      renderWithClient(
        <FeedPanel
          feed={{ ...plain, isNewsletter: true }}
          categories={CATEGORIES}
          onClose={vi.fn<() => void>()}
        />,
      );
      expect(await ui.findFeedPanel()).toBeInTheDocument();
      expect(ui.panel.queryByRole("checkbox", { name: "Opens on its site" })).toBeNull();
    });

    it("reanalyzes, then applies the picked variant to the page", async () => {
      const user = prepare();
      const feed = await webFeed();
      const onClose = vi.fn<() => void>();
      renderWithClient(<FeedPanel feed={feed} categories={CATEGORIES} onClose={onClose} />);

      await user.click(await ui.findReanalyze());
      await user.click(await ui.findVariant("Sidebar links"));
      requests.clear();
      await user.click(ui.panel.getByRole("button", { name: "Apply" }));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledOnce();
      }, SETTLED);
      const [post] = await requests.find({ method: "POST", path: "/api/webfeeds" });
      expect(post.body).toMatchObject({
        url: "https://changelog.example.test/releases",
        variantIndex: 1,
        categoryIds: feed.categoryIds,
      });
    });

    it("goes back to the form on Cancel", async () => {
      const user = prepare();
      const feed = await webFeed();
      renderWithClient(
        <FeedPanel feed={feed} categories={CATEGORIES} onClose={vi.fn<() => void>()} />,
      );

      await user.click(await ui.findReanalyze());
      await ui.findVariant("Release entries");
      await user.click(ui.panel.getByRole("button", { name: "Cancel" }));

      expect(await ui.panel.findByRole("textbox", { name: "Title" })).toHaveValue(feed.title);
    });

    it("disables Cancel while the apply is pending", async () => {
      const user = prepare();
      const feed = await webFeed();
      server.use(http.post("/api/webfeeds", async () => new Promise<never>(() => {})));
      renderWithClient(
        <FeedPanel feed={feed} categories={CATEGORIES} onClose={vi.fn<() => void>()} />,
      );

      await user.click(await ui.findReanalyze());
      await user.click(await ui.findVariant("Sidebar links"));
      await user.click(ui.panel.getByRole("button", { name: "Apply" }));

      await waitFor(() => {
        expect(ui.panel.getByRole("button", { name: "Cancel" })).toBeDisabled();
      });
    });
  });
});
