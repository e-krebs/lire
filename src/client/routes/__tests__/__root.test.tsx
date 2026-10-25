import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { ApiError } from "client/api/client";
import { keys } from "client/api/keys";
import { markQueue } from "client/api/markQueue";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";
import { renderApp } from "test/renderApp";

const ui = {
  get signInLinks() {
    return screen.queryAllByRole("link", { name: "Sign in with NewsBlur" });
  },
  get loadingArticles() {
    return screen.findByRole("status", { name: "Loading articles" });
  },
  get demoBanner() {
    return screen.findByText("Demo with sample data. Reset restores it.");
  },
  get accountButton() {
    return screen.queryByRole("button", { name: "Account and app info" });
  },
  get topBar() {
    return screen.queryByRole("banner");
  },
  get creditsHeading() {
    return screen.findByRole("heading", { level: 1, name: "Credits" });
  },
  get backToSignInLink() {
    return screen.queryByRole("link", { name: "Back to sign in" });
  },
  get splash() {
    return screen.queryByText("Checking your session…");
  },
  get splashLabel() {
    return screen.findByText("Checking your session…");
  },
  get loadingStatus() {
    return screen.queryByRole("status", { name: "Loading articles" });
  },
  get alert() {
    return screen.queryByRole("alert");
  },
};

// Read by the afterEach, which waits out the requests this client still has in flight.
let queryClient: QueryClient | undefined;
let releasePendingStatus: (() => void) | undefined;

class NoIntersectionObserver {
  observe(): void {}
  disconnect(): void {}
}

const setup = ({
  url = "/stream/all",
  signedOut = false,
  demo = false,
  userId,
  pendingStatus = false,
  statusUnavailable = false,
}: {
  url?: string;
  signedOut?: boolean;
  demo?: boolean;
  userId?: number;
  pendingStatus?: boolean;
  statusUnavailable?: boolean;
} = {}) => {
  vi.stubEnv("VITE_API_MODE", "real");
  if (demo) vi.stubEnv("VITE_DEMO", "true");
  vi.stubGlobal("IntersectionObserver", NoIntersectionObserver);
  server.use(fixtureBackend);
  if (pendingStatus) {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    releasePendingStatus = release;
    server.use(
      http.get("/api/auth/status", async () => {
        await pending;
        return HttpResponse.json({ signedIn: false });
      }),
    );
  }
  if (statusUnavailable)
    server.use(http.get("/api/auth/status", () => new HttpResponse(null, { status: 503 })));
  // fixtureBackend answers the auth status as signed in, so a signed-out case overrides it.
  if (signedOut)
    server.use(http.get("/api/auth/status", () => HttpResponse.json({ signedIn: false })));
  if (userId !== undefined)
    server.use(http.get("/api/auth/status", () => HttpResponse.json({ signedIn: true, userId })));
  resetFixtureState();
  const app = renderApp({ url });
  queryClient = app.queryClient;
  return app;
};

describe("root route", () => {
  // A request landing late would change the fixture state the next test starts from. Loops because
  // the render a response triggers can start the next request, and TanStack Query notifies
  // observers on a setTimeout(0), so one task passes before the count is read again. The timeout
  // outlasts the 3s a list fetch can wait for the first mark replay.
  afterEach(async () => {
    releasePendingStatus?.();
    releasePendingStatus = undefined;
    cleanup();
    const client = queryClient;
    queryClient = undefined;
    if (!client) return;
    do {
      await act(async () => {
        await waitFor(
          () => {
            if (client.isFetching() > 0) throw new Error("still fetching");
          },
          { timeout: 5000 },
        );
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
      expect(ui.signInLinks).toHaveLength(2);
      expect(ui.alert).not.toBeInTheDocument();
      for (const link of ui.signInLinks) expect(link).toHaveAttribute("href", "/api/auth/login");
    });
  });

  it("shows a bare splash until auth status resolves", async () => {
    setup({ pendingStatus: true });

    expect(await ui.splashLabel).toBeInTheDocument();
    expect(ui.signInLinks).toHaveLength(0);
    expect(ui.topBar).not.toBeInTheDocument();
    expect(ui.loadingStatus).not.toBeInTheDocument();

    releasePendingStatus?.();
    releasePendingStatus = undefined;
    await waitFor(() => {
      expect(ui.signInLinks).toHaveLength(2);
    });
  });

  it("does not hold the splash while auth status is paused offline", async () => {
    onlineManager.setOnline(false);
    try {
      const { queryClient: client } = setup({ pendingStatus: true });

      await waitFor(() => {
        expect(client.getQueryState(keys.authStatus)?.fetchStatus).toBe("paused");
      });
      expect(ui.splash).not.toBeInTheDocument();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("keeps credits available while auth status is pending", async () => {
    setup({ url: "/credits", pendingStatus: true });

    expect(await ui.creditsHeading).toBeInTheDocument();
    expect(ui.splash).not.toBeInTheDocument();
  });

  it("ends the splash after an auth status server error", async () => {
    setup({ statusUnavailable: true });

    await waitFor(() => {
      expect(ui.signInLinks).toHaveLength(2);
    });
    expect(ui.splash).not.toBeInTheDocument();
  });

  it("hides the top bar and the account menu on the sign-in screen", async () => {
    setup({ signedOut: true });

    await waitFor(() => {
      expect(ui.signInLinks.length).toBeGreaterThan(0);
    });
    expect(ui.accountButton).not.toBeInTheDocument();
    expect(ui.topBar).not.toBeInTheDocument();
  });

  describe("when the url is /credits", () => {
    it("shows the credits page without the top bar when signed out", async () => {
      setup({ url: "/credits", signedOut: true });

      expect(await ui.creditsHeading).toBeInTheDocument();
      await waitFor(() => {
        expect(ui.backToSignInLink).toHaveAttribute("href", "/");
      });
      expect(ui.topBar).not.toBeInTheDocument();
      expect(ui.signInLinks).toHaveLength(0);
    });

    it("shows the top bar and no back link when signed in", async () => {
      setup({ url: "/credits" });

      expect(await ui.creditsHeading).toBeInTheDocument();
      expect(ui.topBar).toBeInTheDocument();
      expect(ui.backToSignInLink).not.toBeInTheDocument();
    });

    it("switches to the signed-out page when a query needs a sign-in", async () => {
      const { queryClient: client } = setup({ url: "/credits" });
      expect(await ui.creditsHeading).toBeInTheDocument();
      expect(ui.topBar).toBeInTheDocument();

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
        expect(ui.backToSignInLink).toBeInTheDocument();
      });
      expect(ui.topBar).not.toBeInTheDocument();
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

    await waitFor(() => expect(ui.alert).toHaveTextContent("Your session ended."));
  });

  it("explains when a previously signed-in session ends", async () => {
    const { queryClient: client } = setup({ userId: 42 });
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

    await waitFor(() => expect(ui.alert).toHaveTextContent("Your session ended."));
  });

  it("tells the mark queue the signed-in user from the auth status", async () => {
    markQueue.reset();
    setup({ userId: 42 });

    await waitFor(() => {
      expect(markQueue.currentUser()).toBe(42);
    });
  });

  it("tells the mark queue the user again after a clear and a refetch", async () => {
    markQueue.reset();
    const { queryClient: client } = setup({ userId: 42 });
    await waitFor(() => {
      expect(markQueue.currentUser()).toBe(42);
    });
    await markQueue.clear();
    expect(markQueue.currentUser()).toBeUndefined();

    await act(async () => {
      await client.invalidateQueries({ queryKey: keys.authStatus });
    });

    await waitFor(() => {
      expect(markQueue.currentUser()).toBe(42);
    });
  });

  it("renders the outlet when signed in", async () => {
    setup();

    expect(await ui.loadingArticles).toBeInTheDocument();
    expect(ui.signInLinks).toHaveLength(0);
  });

  describe("when in the demo", () => {
    it("shows the demo banner, and not the sign-in, in the demo", async () => {
      setup({ signedOut: true, demo: true });
      expect(await ui.demoBanner).toBeInTheDocument();

      expect(ui.signInLinks).toHaveLength(0);
    });

    it("keeps the top bar in the demo even when the auth status says signed out", async () => {
      setup({ signedOut: true, demo: true });
      expect(await ui.demoBanner).toBeInTheDocument();

      expect(ui.topBar).toBeInTheDocument();
    });
  });
});
