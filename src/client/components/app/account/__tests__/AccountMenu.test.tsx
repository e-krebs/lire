import { act, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
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
};

describe("AccountMenu", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    window.localStorage.clear();
    window.sessionStorage.clear();
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

    it("shows the NewsBlur username in the account menu", async () => {
      renderApp({ url: "/subscriptions" });
      await userEvent.click(await ui.accountButton);

      expect(await ui.newsblurUsername).toBeInTheDocument();
    });
  });
});
