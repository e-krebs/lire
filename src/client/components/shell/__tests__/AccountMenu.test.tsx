import { act, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { registerPwa } from "client/utils/pwaUpdate";
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
  get languageSelect() {
    return screen.findByRole("combobox", { name: /^Language/, hidden: true });
  },
  get frenchLanguageSelect() {
    return screen.findByRole("combobox", { name: /^Langue/, hidden: true });
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
});
