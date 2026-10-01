import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { NewsletterPanel } from "client/components/subscriptions/NewsletterPanel";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";
import { seedCategoryId } from "test/seedCategories";
import type { Collection } from "shared/feedsApi/types";

const SETTLED = { timeout: 3000 };
const ADDRESS = "fixture0001@newsletters.example";
const DESIGN = seedCategoryId("Design");

const COLLECTIONS: Collection[] = [
  { id: DESIGN, label: "Design", feeds: [] },
  { id: seedCategoryId("Tech News"), label: "Tech News", feeds: [] },
];

const ui = {
  get generate() {
    return screen.getByRole("button", { name: "Generate address" });
  },
  get copy() {
    return screen.getByRole("button", { name: "Copy" });
  },
  async findCopiedButton() {
    return screen.findByRole("button", { name: "Copied" }, SETTLED);
  },
  get queryCopy() {
    return screen.queryByRole("button", { name: "Copy" });
  },
  get subscribe() {
    return screen.getByRole("button", { name: "Subscribe" });
  },
  get name() {
    return screen.getByRole("textbox", { name: "Name" });
  },
  get design() {
    return screen.getByRole("checkbox", { name: "Design" });
  },
  get filter() {
    return screen.getByRole("searchbox", { name: "Filter categories" });
  },
  get createPodcasts() {
    return screen.getByRole("button", { name: "Create “Podcasts”" });
  },
  get copied() {
    return screen.getByRole("status");
  },
  get alert() {
    return screen.findByRole("alert", undefined, SETTLED);
  },
  address() {
    return screen.queryByText(ADDRESS);
  },
  async findAddress() {
    return screen.findByText(ADDRESS, undefined, SETTLED);
  },
};

const setup = ({
  onClose = vi.fn<() => void>(),
  fakeTimers = false,
}: { onClose?: () => void; fakeTimers?: boolean } = {}) => {
  if (fakeTimers) vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubEnv("VITE_API_MODE", "real");
  server.use(fixtureBackend);
  resetFixtureState();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Created before render so the stubbed clipboard of a later userEvent.setup() is the one read.
  const user = userEvent.setup(fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : undefined);
  render(
    <QueryClientProvider client={client}>
      <NewsletterPanel collections={COLLECTIONS} categoryId={DESIGN} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { user, onClose };
};

describe("NewsletterPanel", () => {
  describe("when the panel opens", () => {
    it("shows no address before the click", () => {
      setup();
      expect(ui.address()).not.toBeInTheDocument();
      expect(ui.generate).toBeInTheDocument();
    });
  });

  describe("when the address is generated", () => {
    it("shows the address", async () => {
      const { user } = setup();
      await user.click(ui.generate);
      expect(await ui.findAddress()).toBeInTheDocument();
    });

    it("copies the address", async () => {
      const { user } = setup();
      await user.click(ui.generate);
      await ui.findAddress();
      await user.click(ui.copy);
      expect(await ui.findCopiedButton()).toBeInTheDocument();
      expect(ui.copied).toBeEmptyDOMElement();
      expect(await navigator.clipboard.readText()).toBe(ADDRESS);
    });

    it("resets the check after the cooldown", async () => {
      const { user } = setup({ fakeTimers: true });
      await user.click(ui.generate);
      await ui.findAddress();
      await user.click(ui.copy);
      await ui.findCopiedButton();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(ui.copy).toBeInTheDocument();
    });

    it("restarts the cooldown on a new copy", async () => {
      const { user } = setup({ fakeTimers: true });
      await user.click(ui.generate);
      await ui.findAddress();
      await user.click(ui.copy);
      await ui.findCopiedButton();
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      await user.click(await ui.findCopiedButton());
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(await ui.findCopiedButton()).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(ui.copy).toBeInTheDocument();
    });

    it("keeps Subscribe disabled until a name is typed", async () => {
      const { user } = setup();
      await user.click(ui.generate);
      await ui.findAddress();
      expect(ui.subscribe).toBeDisabled();
      await user.type(ui.name, "Weekly");
      expect(ui.subscribe).toBeEnabled();
      await user.click(ui.design);
      expect(ui.subscribe).toBeDisabled();
    });

    it("files the feed and closes", async () => {
      const { user, onClose } = setup();
      await user.click(ui.generate);
      await ui.findAddress();
      await user.type(ui.name, "Weekly");
      await user.click(ui.subscribe);
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledOnce();
      }, SETTLED);
    });
  });

  describe("when a new category is created", () => {
    it("selects it for the subscription", async () => {
      const { user } = setup();
      await user.click(ui.generate);
      await ui.findAddress();
      await user.type(ui.name, "Weekly");
      await user.click(ui.design);
      expect(ui.subscribe).toBeDisabled();

      await user.type(ui.filter, "Podcasts");
      await user.click(ui.createPodcasts);

      await waitFor(() => {
        expect(ui.subscribe).toBeEnabled();
      }, SETTLED);
    });
  });

  describe("when the clipboard rejects the write", () => {
    it("tells the user to copy by hand", async () => {
      const { user } = setup();
      await user.click(ui.generate);
      await ui.findAddress();
      vi.stubGlobal("navigator", {
        clipboard: { writeText: async () => Promise.reject(new Error("denied")) },
      });
      fireEvent.click(ui.copy);
      await waitFor(() =>
        expect(ui.copied).toHaveTextContent(
          "Could not copy. Select the address and copy it by hand.",
        ),
      );
    });
  });

  describe("when there is no clipboard", () => {
    it("shows no Copy button", async () => {
      vi.stubGlobal("navigator", { clipboard: undefined });
      vi.stubEnv("VITE_API_MODE", "real");
      server.use(fixtureBackend);
      resetFixtureState();
      render(
        <QueryClientProvider client={new QueryClient()}>
          <NewsletterPanel
            collections={COLLECTIONS}
            categoryId={undefined}
            onClose={vi.fn<() => void>()}
          />
        </QueryClientProvider>,
      );
      fireEvent.click(ui.generate);
      await ui.findAddress();
      expect(ui.queryCopy).not.toBeInTheDocument();
    });
  });

  describe("when the generation fails", () => {
    it("shows an error line", async () => {
      const { user } = setup();
      server.use(http.post("*/v3/feeds/newsletters", () => HttpResponse.json({}, { status: 500 })));
      await user.click(ui.generate);
      expect(await ui.alert).toHaveTextContent("Could not create an address.");
    });
  });
});
