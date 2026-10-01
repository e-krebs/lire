import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { renderApp } from "test/renderApp";

// The menu popover stays closed, so its controls count as hidden.
const ui = {
  get accountButton() {
    return screen.findByRole("button", { name: "Account and app info" });
  },
  get noBrowserSelect() {
    return screen.queryByRole("combobox", { name: /^Open external links in/, hidden: true });
  },
  get browserSelect() {
    return screen.findByRole("combobox", { name: /^Open external links in/, hidden: true });
  },
};

describe("AccountMenu", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
    window.localStorage.clear();
    window.sessionStorage.clear();
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
});
