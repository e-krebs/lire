import { act, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { listenForInstallPrompt } from "client/utils/installPrompt";
import { registerPwa } from "client/utils/pwaUpdate";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";
import { renderApp } from "test/renderApp";

// The menu popover stays closed, so its controls count as hidden.
const ui = {
  get accountButton() {
    return screen.findByRole("button", { name: "Account and app info" });
  },
  get updateEntry() {
    return screen.queryByRole("button", { name: "Reload to update", hidden: true });
  },
  get noBrowserSelect() {
    return screen.queryByRole("combobox", { name: /^Open external links in/, hidden: true });
  },
  get browserSelect() {
    return screen.findByRole("combobox", { name: /^Open external links in/, hidden: true });
  },
  get signOutButton() {
    return screen.findByRole("button", { name: "Sign out", hidden: true });
  },
  get languageSelect() {
    return screen.findByRole("combobox", { name: /^Language/, hidden: true });
  },
  get frenchLanguageSelect() {
    return screen.findByRole("combobox", { name: /^Langue/, hidden: true });
  },
  get newsblurUsername() {
    return screen.findByText("ada-reader");
  },
  get versionRow() {
    return screen.queryByText("Version");
  },
  get creditsLink() {
    return screen.findByRole("link", { name: "Credits", hidden: true });
  },
  get androidAppLink() {
    return screen.queryByRole("link", { name: "Get the Android app", hidden: true });
  },
  get installItem() {
    return screen.findByRole("button", { name: "Install Lire", hidden: true });
  },
  get installButton() {
    return screen.queryByRole("button", { name: "Install Lire", hidden: true });
  },
  get signInLink() {
    return screen.queryByRole("link", { name: "Sign in with NewsBlur", hidden: true });
  },
};

const androidUserAgent = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari/537.36";

const stubMatchMedia = (matches: (query: string) => boolean): void => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

describe("AccountMenu", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("offers the update only while one waits", async () => {
    registerPwa({
      register: ({ onNeedRefresh }) => {
        onNeedRefresh();
        return async () => {};
      },
    });
    renderApp({ url: "/subscriptions" });

    await ui.accountButton;
    expect(ui.updateEntry).toBeInTheDocument();

    act(() => {
      registerPwa({ register: () => async () => {} });
    });
    expect(ui.updateEntry).toBeNull();
  });

  it("hides the browser choice outside an installed app", async () => {
    renderApp({ url: "/subscriptions" });

    await ui.accountButton;
    expect(ui.noBrowserSelect).toBeNull();
  });

  // The Android app marks the session, which needs no device stubs. /subscriptions renders the menu
  // without the stream, which needs IntersectionObserver.
  it("saves the browser picked in the Android app", async () => {
    window.sessionStorage.setItem("lire.twa", "true");
    renderApp({ url: "/subscriptions" });

    const select = await ui.browserSelect;
    expect(select).toHaveValue("default");

    await userEvent.selectOptions(select, "This app");
    expect(select).toHaveValue("none");
    expect(window.localStorage.getItem("lire.externalBrowser")).toBe("none");
  });

  it("switches the UI to French from the language select", async () => {
    renderApp({ url: "/subscriptions" });

    const select = await ui.languageSelect;
    expect(select).toHaveValue("system");

    await userEvent.selectOptions(select, "Français");
    expect(await ui.frenchLanguageSelect).toHaveValue("fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(window.localStorage.getItem("lire.locale")).toBe("fr");
  });

  it("links to Credits and has no version row", async () => {
    renderApp({ url: "/subscriptions" });

    expect(await ui.creditsLink).toHaveAttribute("href", "/credits");
    expect(ui.versionRow).toBeNull();
  });

  it("shows the Android app link in an Android browser", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(androidUserAgent);
    renderApp({ url: "/subscriptions" });

    await ui.accountButton;
    expect(ui.androidAppLink).toBeInTheDocument();
  });

  it("hides the Android app link on desktop", async () => {
    renderApp({ url: "/subscriptions" });

    await ui.accountButton;
    expect(ui.androidAppLink).toBeNull();
  });

  it("hides the Android app link inside the Android app", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(androidUserAgent);
    window.history.replaceState({}, "", "/?source=twa");
    renderApp({ url: "/subscriptions" });

    await ui.accountButton;
    expect(ui.androidAppLink).toBeNull();
  });

  describe("when the browser can install", () => {
    let stop: () => void;

    beforeEach(() => {
      stubMatchMedia(() => false);
    });

    const offerInstall = () => {
      const prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      act(() => {
        window.dispatchEvent(
          Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
            prompt,
            userChoice: Promise.resolve({ outcome: "accepted" }),
          }),
        );
      });
      return prompt;
    };

    beforeEach(() => {
      stop = listenForInstallPrompt();
    });

    afterEach(() => {
      act(() => {
        window.dispatchEvent(new Event("appinstalled"));
      });
      stop();
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, "standalone");
      window.sessionStorage.clear();
    });

    it("offers Install Lire in the menu and runs the prompt when pressed", async () => {
      // jsdom has no popover API.
      const hidePopover = vi.fn<() => void>();
      HTMLElement.prototype.hidePopover = hidePopover;
      renderApp({ url: "/subscriptions" });
      await ui.accountButton;
      expect(ui.installButton).toBeNull();

      const prompt = offerInstall();
      await userEvent.click(await ui.installItem);

      expect(prompt).toHaveBeenCalledOnce();
      expect(hidePopover).toHaveBeenCalledOnce();
    });

    it("hides the install row once installed as an app", async () => {
      stubMatchMedia((query) => query === "(display-mode: standalone)");
      offerInstall();
      renderApp({ url: "/subscriptions" });

      await ui.accountButton;
      expect(ui.installButton).toBeNull();
    });

    it("hides the install row on iOS home-screen apps", async () => {
      Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
      offerInstall();
      renderApp({ url: "/subscriptions" });

      await ui.accountButton;
      expect(ui.installButton).toBeNull();
    });

    it("hides the install row inside the Android app", async () => {
      window.sessionStorage.setItem("lire.twa", "true");
      offerInstall();
      renderApp({ url: "/subscriptions" });

      await ui.accountButton;
      expect(ui.installButton).toBeNull();
    });

    it("hides the install row inside Android Chrome, where the Android app link stands in", async () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(androidUserAgent);
      offerInstall();
      renderApp({ url: "/subscriptions" });

      await ui.accountButton;
      await vi.waitFor(() => {
        expect(ui.androidAppLink).toBeInTheDocument();
      });
      expect(ui.installButton).toBeNull();
    });
  });

  describe("when signed in to NewsBlur", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_API_MODE", "real");
      server.use(fixtureBackend);
    });

    it("signs out from the account row and closes the menu", async () => {
      // jsdom has no popover API.
      const hidePopover = vi.fn<() => void>();
      HTMLElement.prototype.hidePopover = hidePopover;
      const logout = vi.fn<() => void>();
      server.use(
        http.post("*/api/auth/logout", () => {
          logout();
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderApp({ url: "/subscriptions" });

      await userEvent.click(await ui.signOutButton);

      await vi.waitFor(() => {
        expect(logout).toHaveBeenCalledOnce();
      });
      expect(hidePopover).toHaveBeenCalledOnce();
    });

    it("puts the email in the name's tooltip and offers no sign-in link", async () => {
      server.use(
        http.get("*/api/profile", () =>
          HttpResponse.json({ username: "ada-reader", user_id: 1001, email: "ada@example.com" }),
        ),
      );
      renderApp({ url: "/subscriptions" });

      expect(await ui.newsblurUsername).toHaveAttribute("data-tip", "ada@example.com");
      expect(ui.signInLink).toBeNull();
    });

    it("shows the NewsBlur username in the account menu", async () => {
      renderApp({ url: "/subscriptions" });
      await userEvent.click(await ui.accountButton);

      expect(await ui.newsblurUsername).toBeInTheDocument();
    });
  });
});
