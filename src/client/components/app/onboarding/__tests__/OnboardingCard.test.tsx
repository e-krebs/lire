import { createContext, useContext } from "react";
import type { ComponentProps, ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setLocalePreference } from "client/i18n/locale";
import { OnboardingCard } from "client/components/app/onboarding/OnboardingCard";

type OnboardingSteps = ComponentProps<typeof OnboardingCard>["steps"];

type Props = Parameters<typeof OnboardingCard>[0];

const DISMISS_AFTER_MS = 330;

const steps: OnboardingSteps = [
  { id: "language", done: false, auto: false },
  { id: "addFeed", done: false, auto: true, search: { add: true } },
  { id: "newsletter", done: false, auto: false, search: { newsletter: true } },
  { id: "folders", done: false, auto: false, search: { tab: "categories" } },
  { id: "categories", done: false, auto: false },
  { id: "markAsRead", done: false, auto: false },
  { id: "originalSite", done: false, auto: false },
  { id: "install", done: false, auto: true, canInstall: true },
];

const ui = {
  get heading() {
    return screen.getByRole("heading", { name: "Get started with Lire" });
  },
  get card() {
    return screen.getByRole("region", { name: "Get started with Lire" });
  },
  get checkboxes() {
    return screen.getAllByRole("checkbox");
  },
  get addFeedCheckbox() {
    return screen.getByRole("checkbox", { name: "Add your first feed" });
  },
  get progressbar() {
    return screen.getByRole("progressbar", { name: "Checklist progress" });
  },
  get openCategories() {
    return screen.getByRole("link", { name: "Manage categories" });
  },
  get foldersCheckbox() {
    return screen.getByRole("checkbox", { name: "Organize feeds in categories" });
  },
  get browse() {
    return screen.getByRole("button", { name: "Browse" });
  },
  get changeLanguage() {
    return screen.getByRole("button", { name: "Change language" });
  },
  // In row order: the mark-as-read row, then the original-site row.
  get seeHowButtons() {
    return screen.getAllByRole("button", { name: "See how" });
  },
  get howDialog() {
    return screen.getByRole("dialog", { name: "Mark stories as read" });
  },
  get howDialogOrNull() {
    return screen.queryByRole("dialog", { name: "Mark stories as read" });
  },
  get originalSiteClose() {
    return within(this.originalSiteDialog).getByRole("button", { name: "Close" });
  },
  get originalSiteDialog() {
    return screen.getByRole("dialog", { name: "Open stories on their site" });
  },
  get howClose() {
    return within(this.howDialog).getByRole("button", { name: "Close" });
  },
  get installButton() {
    return screen.getByRole("button", { name: "Install" });
  },
  get noInstallButton() {
    return screen.queryByRole("button", { name: "Install" });
  },
  get menuHint() {
    return screen.queryByText("Use your browser’s menu to install Lire.");
  },
  get collapse() {
    return screen.getByRole("button", { name: "Collapse the checklist" });
  },
  get rows() {
    return screen.getByRole("list");
  },
  get allSet() {
    return screen.getByText("You are all set");
  },
  get dismiss() {
    return screen.getByRole("button", { name: "Dismiss the checklist" });
  },
};

// The how-to dialog renders the reader header even while closed, and that header reads the
// stream param, so the card renders inside a loaded router's match.
const SlotContext = createContext<ReactNode>(null);
const Slot = () => <>{useContext(SlotContext)}</>;
const rootRoute = createRootRoute({ component: Slot });
const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/stream/$streamKey" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/subscriptions" }),
  ]),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

const setup = (overrides: Partial<Props> = {}) => {
  const props = {
    steps,
    collapsed: false,
    onToggleCollapse: vi.fn<Props["onToggleCollapse"]>(),
    onToggleStep: vi.fn<Props["onToggleStep"]>(),
    onAction: vi.fn<Props["onAction"]>(),
    dismissing: false,
    onDismissStart: vi.fn<Props["onDismissStart"]>(),
    onDismiss: vi.fn<Props["onDismiss"]>(),
    ...overrides,
  };
  const card = (cardProps: Props, key?: string) => (
    <SlotContext.Provider value={<OnboardingCard key={key} {...cardProps} />}>
      <RouterProvider router={router} />
    </SlotContext.Provider>
  );
  const { rerender: rerenderCard } = render(card(props));
  const rerender = (next: Props, key?: string) => {
    rerenderCard(card(next, key));
  };
  return { props, rerender, router };
};

describe("OnboardingCard", () => {
  beforeAll(async () => {
    await router.load();
  });

  afterEach(() => {
    setLocalePreference("system");
  });

  it("shows the optional rows, progress, and automatic completion states", () => {
    setLocalePreference("en");
    setup();

    expect(ui.heading).toBeInTheDocument();
    expect(ui.checkboxes).toHaveLength(8);
    expect(ui.addFeedCheckbox).toBeDisabled();
    expect(ui.progressbar).toHaveAttribute("aria-valuenow", "0");
  });

  it("renders the navigating rows as links and the others as buttons", () => {
    setLocalePreference("en");
    setup();

    expect(ui.openCategories).toHaveAttribute("href", "/subscriptions?tab=categories");
    expect(ui.browse.tagName).toBe("BUTTON");
    expect(ui.changeLanguage.tagName).toBe("BUTTON");
  });

  it("sends button actions to the parent without ticking the row", () => {
    setLocalePreference("en");
    const { props } = setup();

    fireEvent.click(ui.browse);
    fireEvent.click(ui.changeLanguage);

    expect(props.onAction).toHaveBeenNthCalledWith(1, "categories");
    expect(props.onAction).toHaveBeenNthCalledWith(2, "language");
    expect(props.onToggleStep).not.toHaveBeenCalled();
  });

  it("leaves a link row to the router without ticking it", () => {
    setLocalePreference("en");
    const { props, router } = setup();

    fireEvent.click(ui.openCategories);

    expect(props.onAction).not.toHaveBeenCalled();
    expect(props.onToggleStep).not.toHaveBeenCalled();
    expect(router.history.location.href).toBe("/subscriptions?tab=categories");
  });

  it("ticks a row only through its checkbox, and points collapse at the rows", () => {
    setLocalePreference("en");
    const { props } = setup();

    fireEvent.click(ui.foldersCheckbox);
    fireEvent.click(ui.collapse);

    expect(props.onAction).not.toHaveBeenCalled();
    expect(props.onToggleStep).toHaveBeenCalledWith({ id: "folders", done: true });
    expect(props.onToggleCollapse).toHaveBeenCalledOnce();
    expect(ui.collapse).toHaveAttribute("aria-controls", ui.rows.id);
  });

  it("opens the sample stories dialog from See how, and closes it", () => {
    setLocalePreference("en");
    const { props } = setup();

    fireEvent.click(ui.seeHowButtons[0]);

    const dialog = ui.howDialog;
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent("Sample story three");
    fireEvent.click(ui.howClose);
    expect(dialog).not.toHaveAttribute("open");
    expect(props.onAction).not.toHaveBeenCalled();
    expect(props.onToggleStep).not.toHaveBeenCalled();
  });

  it("opens the original-site dialog from its See how, and never ticks the row", () => {
    setLocalePreference("en");
    const { props } = setup();

    fireEvent.click(ui.seeHowButtons[1]);

    const dialog = ui.originalSiteDialog;
    expect(dialog).toHaveAttribute("open");
    expect(ui.howDialogOrNull).toBeNull();
    fireEvent.click(ui.originalSiteClose);
    expect(dialog).not.toHaveAttribute("open");
    expect(props.onAction).not.toHaveBeenCalled();
    expect(props.onToggleStep).not.toHaveBeenCalled();
  });

  it("offers Install while the browser can still show its prompt", () => {
    setLocalePreference("en");
    const { props } = setup();

    fireEvent.click(ui.installButton);

    expect(props.onAction).toHaveBeenCalledWith("install");
    expect(ui.menuHint).toBeNull();
  });

  it("drops the Install button after a spent prompt, and points to the browser menu", () => {
    setLocalePreference("en");
    setup({
      steps: steps.map((step) => (step.id === "install" ? { ...step, canInstall: false } : step)),
    });

    expect(ui.noInstallButton).toBeNull();
    expect(ui.menuHint).toBeInTheDocument();
  });

  it("dismisses once the flight ends and shows the all-set action", () => {
    vi.useFakeTimers();
    try {
      setLocalePreference("en");
      const { props } = setup({ steps: steps.map((step) => ({ ...step, done: true })) });

      expect(ui.allSet).toBeInTheDocument();
      fireEvent.click(ui.dismiss);
      expect(props.onDismissStart).toHaveBeenCalledOnce();
      expect(props.onDismiss).not.toHaveBeenCalled();
      vi.advanceTimersByTime(DISMISS_AFTER_MS);

      expect(props.onDismiss).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a card that remounts mid-flight inert, then still dismisses", () => {
    vi.useFakeTimers();
    try {
      const { props, rerender } = setup();

      fireEvent.click(ui.dismiss);
      // The parent flips `dismissing` on the click; the moved instance mounts already flying.
      rerender({ ...props, dismissing: true }, "moved");

      expect(ui.card).toHaveAttribute("inert");
      expect(ui.card).toHaveClass("pointer-events-none", "card-absorb");
      vi.advanceTimersByTime(DISMISS_AFTER_MS);

      expect(props.onDismiss).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops the flight when the parent clears dismissing, so the card is live again", () => {
    const { props, rerender } = setup();

    fireEvent.click(ui.dismiss);
    rerender({ ...props, dismissing: true });
    expect(ui.card).toHaveClass("card-absorb");

    rerender({ ...props, dismissing: false });

    expect(ui.card).not.toHaveAttribute("inert");
    expect(ui.card).not.toHaveClass("card-absorb", "pointer-events-none");
    expect(ui.card).not.toHaveAttribute("style");
  });
});
