import { act, cleanup, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { ApiError } from "client/api/client";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";
import { renderApp } from "test/renderApp";

const ui = {
  get signInLink() {
    return screen.queryByRole("link", { name: "Sign in with NewsBlur" });
  },
  get loadingArticles() {
    return screen.findByRole("status", { name: "Loading articles" });
  },
  get demoBanner() {
    return screen.findByText("Demo with sample data. Reset restores it.");
  },
};

// Read by the afterEach, which waits out the requests this client still has in flight.
let queryClient: QueryClient | undefined;

class NoIntersectionObserver {
  observe(): void {}
  disconnect(): void {}
}

const setup = ({
  url = "/stream/all",
  signedOut = false,
  demo = false,
}: { url?: string; signedOut?: boolean; demo?: boolean } = {}) => {
  vi.stubEnv("VITE_API_MODE", "real");
  if (demo) vi.stubEnv("VITE_DEMO", "true");
  vi.stubGlobal("IntersectionObserver", NoIntersectionObserver);
  server.use(fixtureBackend);
  // fixtureBackend answers the auth status as signed in, so a signed-out case overrides it.
  if (signedOut)
    server.use(http.get("/api/auth/status", () => HttpResponse.json({ signedIn: false })));
  resetFixtureState();
  const app = renderApp({ url });
  queryClient = app.queryClient;
  return app;
};

describe("root route", () => {
  // A request landing late would change the fixture state the next test starts from. Loops because
  // the render a response triggers can start the next request, and TanStack Query notifies
  // observers on a setTimeout(0), so one task passes before the count is read again.
  afterEach(async () => {
    cleanup();
    const client = queryClient;
    queryClient = undefined;
    if (!client) return;
    do {
      await act(async () => {
        await waitFor(() => {
          if (client.isFetching() > 0) throw new Error("still fetching");
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    } while (client.isFetching() > 0);
  });

  describe("when the url is /", () => {
    it("redirects to the all-entries stream", async () => {
      const { router } = setup({ url: "/" });

      await vi.waitFor(() => {
        expect(router.state.location.pathname).toBe("/stream/all");
      });
    });
  });

  it("shows the sign-in screen when signed out", async () => {
    setup({ signedOut: true });

    await waitFor(() => {
      expect(ui.signInLink).toHaveAttribute("href", "/api/auth/login");
    });
  });

  it("shows the sign-in screen once any query needs a sign-in", async () => {
    const { queryClient: client } = setup();
    await ui.loadingArticles;

    act(() => {
      client
        .getQueryCache()
        .build(client, { queryKey: ["probe"] })
        .setState({
          status: "error",
          error: new ApiError({ status: 401, code: "sign_in_required" }),
        });
    });

    await waitFor(() => {
      expect(ui.signInLink).toBeInTheDocument();
    });
  });

  it("renders the outlet when signed in", async () => {
    setup();

    expect(await ui.loadingArticles).toBeInTheDocument();
    expect(ui.signInLink).not.toBeInTheDocument();
  });

  describe("when in the demo", () => {
    it("shows the demo banner, and not the sign-in, in the demo", async () => {
      setup({ signedOut: true, demo: true });
      expect(await ui.demoBanner).toBeInTheDocument();

      expect(ui.signInLink).not.toBeInTheDocument();
    });
  });
});
