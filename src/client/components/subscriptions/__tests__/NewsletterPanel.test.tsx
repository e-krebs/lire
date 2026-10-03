import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEMO_NEWSLETTER_ADDRESS, resetFixtureState } from "client/api/adapters/fixture";
import { NewsletterPanel } from "client/components/subscriptions/NewsletterPanel";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";

const SETTLED = { timeout: 3000 };

const ui = {
  async findCopy() {
    return screen.findByRole("button", { name: "Copy" }, SETTLED);
  },
  async findCopiedButton() {
    return screen.findByRole("button", { name: "Copied" }, SETTLED);
  },
  get copy() {
    return screen.getByRole("button", { name: "Copy" });
  },
  get queryCopy() {
    return screen.queryByRole("button", { name: "Copy" });
  },
  get copied() {
    return screen.getByRole("status");
  },
  get close() {
    return screen.getByRole("button", { name: "Close" });
  },
  get alert() {
    return screen.findByRole("alert", undefined, SETTLED);
  },
  async findAddress() {
    return screen.findByText(DEMO_NEWSLETTER_ADDRESS, undefined, SETTLED);
  },
};

const setup = ({
  onClose = vi.fn<() => void>(),
  fakeTimers = false,
  failAddress = false,
}: { onClose?: () => void; fakeTimers?: boolean; failAddress?: boolean } = {}) => {
  if (fakeTimers) vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubEnv("VITE_API_MODE", "real");
  server.use(fixtureBackend);
  if (failAddress) {
    server.use(http.get("*/api/newsletter-address", () => HttpResponse.json({}, { status: 500 })));
  }
  resetFixtureState();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Created before render so the stubbed clipboard of a later userEvent.setup() is the one read.
  const user = userEvent.setup(fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : undefined);
  render(
    <QueryClientProvider client={client}>
      <NewsletterPanel onClose={onClose} />
    </QueryClientProvider>,
  );
  return { user, onClose };
};

describe("NewsletterPanel", () => {
  describe("when the panel opens", () => {
    it("shows the account's address", async () => {
      setup();
      expect(await ui.findAddress()).toBeInTheDocument();
    });

    it("closes from the Close button", async () => {
      const { user, onClose } = setup();
      await ui.findAddress();
      await user.click(ui.close);
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe("when the address is copied", () => {
    it("copies the address", async () => {
      const { user } = setup();
      await user.click(await ui.findCopy());
      expect(await ui.findCopiedButton()).toBeInTheDocument();
      expect(ui.copied).toBeEmptyDOMElement();
      expect(await navigator.clipboard.readText()).toBe(DEMO_NEWSLETTER_ADDRESS);
    });

    it("resets the check after the cooldown", async () => {
      const { user } = setup({ fakeTimers: true });
      await user.click(await ui.findCopy());
      await ui.findCopiedButton();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(ui.copy).toBeInTheDocument();
    });

    it("restarts the cooldown on a new copy", async () => {
      const { user } = setup({ fakeTimers: true });
      await user.click(await ui.findCopy());
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
  });

  describe("when the clipboard rejects the write", () => {
    it("tells the user to copy by hand", async () => {
      setup();
      await ui.findAddress();
      vi.stubGlobal("navigator", {
        languages: ["en-US"],
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
      vi.stubGlobal("navigator", { languages: ["en-US"], clipboard: undefined });
      vi.stubEnv("VITE_API_MODE", "real");
      server.use(fixtureBackend);
      resetFixtureState();
      render(
        <QueryClientProvider client={new QueryClient()}>
          <NewsletterPanel onClose={vi.fn<() => void>()} />
        </QueryClientProvider>,
      );
      await ui.findAddress();
      expect(ui.queryCopy).not.toBeInTheDocument();
    });
  });

  describe("when the address fails to load", () => {
    it("shows an error line", async () => {
      setup({ failAddress: true });
      expect(await ui.alert).toHaveTextContent("Could not load your address.");
    });
  });
});
