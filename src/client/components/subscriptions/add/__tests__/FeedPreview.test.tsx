import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, type HttpHandler } from "msw";
import { describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { FeedPreview } from "client/components/subscriptions/add/AddFeed/FeedPreview";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";

const FEED_URL = "https://preview.example.test/feed.xml";
const ORIGIN_TITLE = "Example Preview Weekly";
const SIDEBAR = "Preview: the sidebar moves to the left";
const UNAVAILABLE = "Preview unavailable. You can still subscribe.";

const ui = {
  async findText(text: string) {
    return screen.findByText(text);
  },
  async findAlert() {
    return screen.findByRole("alert");
  },
  get section() {
    return screen.getByText("Latest entries").closest("section");
  },
  get loading() {
    return screen.queryByText("Loading…");
  },
  get empty() {
    return screen.queryByText("No entries yet");
  },
  get alert() {
    return screen.queryByRole("alert");
  },
  get retry() {
    return screen.getByRole("button", { name: "Retry" });
  },
  tile(title: string) {
    return screen.getByText(title).closest("[inert]");
  },
  queryTile(title: string) {
    return screen.queryByText(title);
  },
};

const setup = ({ preview }: { preview?: HttpHandler } = {}) => {
  vi.stubEnv("VITE_API_MODE", "real");
  server.use(fixtureBackend);
  if (preview) server.use(preview);
  resetFixtureState();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FeedPreview feedUrl={FEED_URL} originTitle={ORIGIN_TITLE} />
    </QueryClientProvider>,
  );
  return { ui };
};

describe("FeedPreview", () => {
  describe("when the preview is still loading", () => {
    it("shows a loading status and marks the section busy", () => {
      const { ui } = setup({
        preview: http.get("/api/feeds/preview", async () => new Promise(() => {})),
      });

      expect(ui.loading).toBeInTheDocument();
      expect(ui.section).toHaveAttribute("aria-busy", "true");
    });
  });

  describe("when the feed has no entries", () => {
    it("says there are none yet", async () => {
      const { ui } = setup({
        preview: http.get("/api/feeds/preview", () => HttpResponse.json({ entries: [] })),
      });

      expect(await ui.findText("No entries yet")).toBeInTheDocument();
      expect(ui.section).toHaveAttribute("aria-busy", "false");
      expect(ui.loading).toBeNull();
    });
  });

  describe("when the preview request fails", () => {
    it("says the preview is unavailable and offers a retry", async () => {
      const { ui } = setup({
        preview: http.get("/api/feeds/preview", () =>
          HttpResponse.json({ error: "boom" }, { status: 500 }),
        ),
      });

      expect(await ui.findText(UNAVAILABLE)).toBeInTheDocument();
      expect(ui.alert).toHaveTextContent(UNAVAILABLE);
      expect(ui.retry).toBeInTheDocument();
    });

    it("fetches the preview again on retry", async () => {
      let calls = 0;
      const { ui } = setup({
        preview: http.get("/api/feeds/preview", () => {
          calls += 1;
          return calls === 1
            ? HttpResponse.json({ error: "boom" }, { status: 500 })
            : HttpResponse.json({
                entries: [{ title: "Back after retry", url: "https://preview.example.test/a" }],
              });
        }),
      });

      await ui.findAlert();
      fireEvent.click(ui.retry);

      expect(await ui.findText("Back after retry")).toBeInTheDocument();
      expect(ui.alert).toBeNull();
    });
  });

  describe("when the feed has entries", () => {
    it("shows the two latest as tiles and drops the rest", async () => {
      const { ui } = setup({
        preview: http.get("/api/feeds/preview", () =>
          HttpResponse.json({
            entries: [
              { title: "Newest", url: "https://preview.example.test/1" },
              { title: "Second", url: "https://preview.example.test/2" },
              { title: "Third", url: "https://preview.example.test/3" },
            ],
          }),
        ),
      });

      expect(await ui.findText("Newest")).toBeInTheDocument();
      expect(ui.tile("Second")).toBeInTheDocument();
      expect(ui.queryTile("Third")).toBeNull();
    });

    it("renders the fixture's entries as inert, hidden-from-AT tiles", async () => {
      const { ui } = setup();

      expect(await ui.findText(SIDEBAR)).toBeInTheDocument();
      expect(ui.tile(SIDEBAR)).toHaveAttribute("aria-hidden", "true");
    });

    it("sizes a photo entry to the grid tile proportions", async () => {
      const { ui } = setup({
        preview: http.get("/api/feeds/preview", () =>
          HttpResponse.json({
            entries: [
              {
                title: "With a photo",
                url: "https://preview.example.test/photo",
                imageUrl: "https://preview.example.test/photo.jpg",
              },
            ],
          }),
        ),
      });

      expect(await ui.findText("With a photo")).toBeInTheDocument();
      expect(ui.tile("With a photo")).toHaveStyle({ height: "1200px" });
    });

    it("keeps the tile out of the tab order", async () => {
      const { ui } = setup();

      expect(await ui.findText(SIDEBAR)).toBeInTheDocument();
      expect(ui.tile(SIDEBAR)).toHaveAttribute("inert");
      expect(ui.tile(SIDEBAR)!.querySelector("[tabindex]")).toBeNull();
    });
  });
});
