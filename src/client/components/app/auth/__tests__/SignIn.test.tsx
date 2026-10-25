import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignIn, type SignInProps } from "client/components/app/auth/SignIn";
import { setLocalePreference } from "client/i18n/locale";

const ui = {
  get steps() {
    return screen.queryByRole("list", { name: "How it works, in three steps" });
  },
  get signInButtons() {
    return screen.queryAllByRole("link", { name: "Sign in with NewsBlur" });
  },
  get tryAgainButton() {
    return screen.queryByRole("link", { name: "Try again" });
  },
  get alert() {
    return screen.queryByRole("alert");
  },
  get appName() {
    return screen.queryByText("Lire", { selector: "span" });
  },
  get creditsLink() {
    return screen.getByRole("link", { name: "Credits" });
  },
  get badgeLink() {
    return screen.queryByRole("link", { name: "Get it on Google Play" });
  },
  get badgeImage() {
    return document.querySelector('a[href^="https://play.google.com/"] img');
  },
};

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Version/17.0 Safari/605.1.15";

const renderSignIn = async (props: SignInProps = {}) => {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <SignIn {...props} /> }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
};

const setUserAgent = (userAgent: string) =>
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);

describe("SignIn", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    setUserAgent(DESKTOP_UA);
  });

  afterEach(() => {
    setLocalePreference("system");
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("shows the landing sections and the Credits link on the plain page", async () => {
    await renderSignIn();

    expect(ui.steps).toBeInTheDocument();
    expect(ui.signInButtons).toHaveLength(2);
    for (const button of ui.signInButtons) {
      expect(button).toHaveAttribute("href", "/api/auth/login");
    }
    expect(ui.creditsLink).toHaveAttribute("href", "/credits");
  });

  it("shows the app name next to its icon in the header", async () => {
    await renderSignIn();

    expect(ui.appName).toBeInTheDocument();
  });

  it("shows the Android badge in an Android browser", async () => {
    setUserAgent(ANDROID_UA);
    await renderSignIn();

    expect(ui.badgeLink).toHaveAttribute(
      "href",
      "https://play.google.com/store/apps/details?id=tech.krebs.lire",
    );
    expect(ui.badgeLink).toHaveAttribute("target", "_blank");
    expect(ui.badgeLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("hides the Android badge in the TWA launch URL", async () => {
    setUserAgent(ANDROID_UA);
    window.history.replaceState({}, "", "/?source=twa");
    await renderSignIn();

    expect(ui.badgeLink).not.toBeInTheDocument();
  });

  it("hides the Android badge in the TWA once its session key is stored", async () => {
    setUserAgent(ANDROID_UA);
    window.sessionStorage.setItem("lire.twa", "true");
    await renderSignIn();

    expect(ui.badgeLink).not.toBeInTheDocument();
  });

  it("hides the Android badge on desktop", async () => {
    await renderSignIn();

    expect(ui.badgeLink).not.toBeInTheDocument();
  });

  it("picks the French badge in French and the English one otherwise", async () => {
    setUserAgent(ANDROID_UA);
    setLocalePreference("fr");
    const { unmount } = await renderSignIn();

    expect(ui.badgeImage).toHaveAttribute("alt", "Disponible sur Google Play");
    expect(ui.badgeImage?.getAttribute("src")).toContain("badge-fr");
    unmount();

    setLocalePreference("en");
    await renderSignIn();

    expect(ui.badgeImage?.getAttribute("src")).toContain("badge-en");
  });

  it.each([
    ["failed", "NewsBlur sign-in failed, try again."],
    ["denied", "You declined access on NewsBlur, so Lire can't read your subscriptions yet."],
    ["expired", "This sign-in took too long and expired. Start it again."],
    ["ended", "Your session ended. Sign in again to read your subscriptions."],
  ] as const)("shows the %s failure with Try again and Credits only", async (failure, message) => {
    await renderSignIn({ failure });

    expect(ui.alert).toHaveTextContent(message);
    expect(ui.tryAgainButton).toHaveAttribute("href", "/api/auth/login");
    expect(ui.creditsLink).toHaveAttribute("href", "/credits");
    expect(ui.steps).not.toBeInTheDocument();
    expect(ui.signInButtons).toHaveLength(0);
  });
});
