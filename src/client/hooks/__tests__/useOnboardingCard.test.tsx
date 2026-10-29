import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keys } from "client/api/keys";
import { listenForInstallPrompt } from "client/utils/installPrompt";
import { server } from "test/msw";
import type { OnboardingState } from "shared/feedsApi/types";
import { resetFixtureState } from "client/api/adapters/fixture";
import { fixtureBackend } from "test/fixtureBackend";
import { useOnboardingCard } from "../useOnboardingCard";

const onboardingState = (overrides: Partial<OnboardingState> = {}): OnboardingState => ({
  done: {},
  collapsed: false,
  dismissed: false,
  ...overrides,
});

const fireBeforeInstall = () => {
  const prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return prompt;
};

const makeRouter = () => {
  const rootRoute = createRootRoute();
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/subscriptions" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/stream/$streamKey" }),
  ]);
  return createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) });
};

const renderCard = ({
  state = onboardingState(),
  feeds = [],
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }),
}: {
  state?: OnboardingState | null;
  feeds?: unknown[];
  client?: QueryClient;
} = {}) => {
  if (state) client.setQueryData(keys.onboarding, state);
  client.setQueryData(keys.feeds, feeds);
  const router = makeRouter();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RouterContextProvider router={router}>{children}</RouterContextProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useOnboardingCard(), { wrapper });
  return { result, router };
};

const idsOf = (steps: { id: string }[]): string[] => steps.map((step) => step.id);

describe("useOnboardingCard", () => {
  let stop: () => void;

  beforeEach(() => {
    stop = listenForInstallPrompt();
  });

  afterEach(() => {
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    stop();
    vi.unstubAllEnvs();
  });

  it("returns no steps while the state is loading", () => {
    server.use(http.get("/api/onboarding", () => HttpResponse.json({}, { status: 500 })));
    const { result } = renderCard({ state: null });

    expect(result.current.state).toBeUndefined();
    expect(result.current.steps).toEqual([]);
  });

  it("reads addFeed from the stored ticks, not from the feed list", () => {
    const open = renderCard({ feeds: [{ id: "1" }] }).result.current.steps.find(
      (step) => step.id === "addFeed",
    );
    expect(open).toMatchObject({ id: "addFeed", done: false, auto: false });

    const ticked = renderCard({
      feeds: [],
      state: onboardingState({ done: { addFeed: true } }),
    }).result.current.steps.find((step) => step.id === "addFeed");
    expect(ticked).toMatchObject({ id: "addFeed", done: true, auto: false });
  });

  it("reads stored ticks and leaves unticked rows open", () => {
    const { result } = renderCard({
      state: onboardingState({ done: { newsletter: true, folders: true } }),
    });

    const done = Object.fromEntries(result.current.steps.map((step) => [step.id, step.done]));
    expect(done).toMatchObject({
      newsletter: true,
      folders: true,
      categories: false,
      markAsRead: false,
      language: false,
    });
  });

  it("reads a state saved before the originalSite row as not done", () => {
    const { result } = renderCard({
      state: onboardingState({
        done: {
          addFeed: true,
          newsletter: true,
          folders: true,
          categories: true,
          markAsRead: true,
          language: true,
        },
      }),
    });

    expect(result.current.steps.find((step) => step.id === "originalSite")?.done).toBe(false);
    expect(result.current.completed).toBe(false);
  });

  it("is not completed while the state is loading", () => {
    server.use(http.get("/api/onboarding", () => HttpResponse.json({}, { status: 500 })));

    expect(renderCard({ state: null }).result.current.completed).toBe(false);
  });

  it("is completed once every row is done, without an install row", () => {
    const { result } = renderCard({
      state: onboardingState({
        done: {
          addFeed: true,
          newsletter: true,
          folders: true,
          categories: true,
          markAsRead: true,
          language: true,
          originalSite: true,
        },
      }),
    });

    expect(result.current.completed).toBe(true);
  });

  it("is not completed while one stored row is open", () => {
    const { result } = renderCard({
      state: onboardingState({
        done: {
          addFeed: true,
          newsletter: true,
          folders: true,
          categories: true,
          markAsRead: true,
        },
      }),
    });

    expect(result.current.completed).toBe(false);
  });

  it("is not completed while the offered install row is open", () => {
    fireBeforeInstall();
    const { result } = renderCard({
      state: onboardingState({
        done: {
          addFeed: true,
          newsletter: true,
          folders: true,
          categories: true,
          markAsRead: true,
          language: true,
          originalSite: true,
        },
      }),
    });

    expect(result.current.completed).toBe(false);
  });

  it("lists the rows by theme, language first and install last", () => {
    fireBeforeInstall();

    expect(idsOf(renderCard().result.current.steps)).toEqual([
      "language",
      "addFeed",
      "newsletter",
      "folders",
      "categories",
      "markAsRead",
      "originalSite",
      "install",
    ]);
  });

  it("omits the install row without a browser prompt", () => {
    expect(idsOf(renderCard().result.current.steps)).not.toContain("install");
  });

  it("shows the install row once the browser offers the prompt", () => {
    fireBeforeInstall();

    expect(idsOf(renderCard().result.current.steps)).toContain("install");
  });

  it("marks the install row auto, so its checkbox is disabled", () => {
    fireBeforeInstall();

    expect(renderCard().result.current.steps.find((step) => step.id === "install")).toEqual({
      id: "install",
      done: false,
      auto: true,
      canInstall: true,
    });
  });

  it("ticks the install row by itself inside an installed app", () => {
    fireBeforeInstall();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(display-mode: standalone)",
    }));

    expect(renderCard().result.current.steps.find((step) => step.id === "install")).toMatchObject({
      done: true,
      auto: true,
    });
  });

  it("keeps the install row after its prompt is started", async () => {
    fireBeforeInstall();
    const { result } = renderCard();

    act(() => {
      result.current.onAction("install");
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(idsOf(result.current.steps)).toContain("install");
    expect(result.current.steps.find((step) => step.id === "install")).toMatchObject({
      canInstall: false,
    });
  });

  it("ticks the install row once the app is installed", async () => {
    fireBeforeInstall();
    const { result } = renderCard();

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    await vi.waitFor(() => {
      expect(result.current.steps.find((step) => step.id === "install")).toMatchObject({
        done: true,
      });
    });
  });

  it("shows the install row when matchMedia is missing", () => {
    fireBeforeInstall();
    vi.stubGlobal("matchMedia", undefined);

    expect(idsOf(renderCard().result.current.steps)).toContain("install");
  });

  it("ticks a stored step on and off", async () => {
    const { result } = renderCard();
    const folders = () => result.current.steps.find((step) => step.id === "folders")?.done;

    act(() => {
      result.current.toggleStep({ id: "folders", done: true });
    });
    await vi.waitFor(() => {
      expect(folders()).toBe(true);
    });

    act(() => {
      result.current.toggleStep({ id: "folders", done: false });
    });
    await vi.waitFor(() => {
      expect(folders()).toBe(false);
    });
  });

  it("unticks addFeed like the other manual rows", async () => {
    const { result } = renderCard({ state: onboardingState({ done: { addFeed: true } }) });
    const addFeed = () => result.current.steps.find((step) => step.id === "addFeed")?.done;

    act(() => {
      result.current.toggleStep({ id: "addFeed", done: false });
    });
    await vi.waitFor(() => {
      expect(addFeed()).toBe(false);
    });
    act(() => {
      result.current.toggleStep({ id: "addFeed", done: true });
    });
    await vi.waitFor(() => {
      expect(addFeed()).toBe(true);
    });
  });

  it("ignores toggles on the install row", async () => {
    const { result } = renderCard();
    const before = result.current.state;

    act(() => {
      result.current.toggleStep({ id: "install", done: true });
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(result.current.state).toBe(before);
  });

  it("flips the collapse state", async () => {
    const { result } = renderCard();

    act(() => {
      result.current.toggleCollapse();
    });
    await vi.waitFor(() => {
      expect(result.current.state?.collapsed).toBe(true);
    });
  });

  it("sets the dismissed state", async () => {
    const { result } = renderCard();

    act(() => {
      result.current.setDismissed(true);
    });
    await vi.waitFor(() => {
      expect(result.current.state?.dismissed).toBe(true);
    });
  });

  it("hands focus to the account menu and flags the flight when it starts", () => {
    const trigger = document.createElement("button");
    trigger.id = "account-menu-trigger";
    document.body.append(trigger);
    const { result } = renderCard();

    act(() => {
      result.current.onDismissStart();
    });
    expect(document.activeElement).toBe(trigger);
    expect(result.current.dismissing).toBe(true);
    trigger.remove();
  });

  it("goes live again when the dismiss fails to save", async () => {
    vi.stubEnv("VITE_API_MODE", "real");
    server.use(fixtureBackend);
    server.use(http.patch("/api/onboarding", () => HttpResponse.json({}, { status: 500 })));
    resetFixtureState();
    const { result } = renderCard();

    act(() => {
      result.current.onDismissStart();
      result.current.onDismiss();
    });
    expect(result.current.dismissing).toBe(true);
    await vi.waitFor(() => {
      expect(result.current.dismissing).toBe(false);
    });
    expect(result.current.state?.dismissed).toBe(false);
  });

  it("goes live again when the dismissed card is shown from the menu", async () => {
    vi.stubEnv("VITE_API_MODE", "real");
    server.use(fixtureBackend);
    resetFixtureState();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    // The stream route and the account menu each call the hook, with their own state.
    const { result: route } = renderCard({ client });
    const { result: menu } = renderCard({ client });

    act(() => {
      route.current.onDismissStart();
      route.current.onDismiss();
    });
    await vi.waitFor(() => {
      expect(route.current.state?.dismissed).toBe(true);
    });

    act(() => {
      menu.current.setDismissed(false);
    });
    await vi.waitFor(() => {
      expect(route.current.state?.dismissed).toBe(false);
    });
    expect(route.current.dismissing).toBe(false);
  });

  it("starts the browser install from the install row", async () => {
    const prompt = fireBeforeInstall();
    const { result } = renderCard();

    act(() => {
      result.current.onAction("install");
    });
    await vi.waitFor(() => {
      expect(prompt).toHaveBeenCalledOnce();
    });
  });

  it("asks the language select to focus without ticking the row", () => {
    const focus = vi.fn<() => void>();
    window.addEventListener("lire:focus-language-select", focus);
    const { result } = renderCard();

    act(() => {
      result.current.onAction("language");
    });
    expect(focus).toHaveBeenCalledOnce();
    expect(result.current.steps.find((step) => step.id === "language")?.done).toBe(false);
    window.removeEventListener("lire:focus-language-select", focus);
  });

  it("asks the navigator to open for the categories row without ticking it", () => {
    const open = vi.fn<() => void>();
    window.addEventListener("lire:open-navigator", open);
    const { result, router } = renderCard();

    act(() => {
      result.current.onAction("categories");
    });
    expect(open).toHaveBeenCalledOnce();
    expect(result.current.steps.find((step) => step.id === "categories")?.done).toBe(false);
    expect(router.history.location.pathname).toBe("/");
    window.removeEventListener("lire:open-navigator", open);
  });

  it("never ticks the originalSite row when its action runs", () => {
    const { result } = renderCard();

    act(() => {
      result.current.onAction("originalSite");
    });
    expect(result.current.steps.find((step) => step.id === "originalSite")?.done).toBe(false);
  });

  it("gives each link row the Subscriptions search it opens, and no other row one", () => {
    const { result } = renderCard();

    const searchOf = (id: string) => {
      const step = result.current.steps.find((candidate) => candidate.id === id);
      return step !== undefined && "search" in step ? step.search : undefined;
    };
    expect(searchOf("addFeed")).toEqual({ add: true });
    expect(searchOf("newsletter")).toEqual({ newsletter: true });
    expect(searchOf("folders")).toEqual({ tab: "categories" });
    expect(searchOf("categories")).toBeUndefined();
    expect(searchOf("markAsRead")).toBeUndefined();
    expect(searchOf("language")).toBeUndefined();
  });
});
