import { act, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "test/renderApp";

const ui = {
  get noTargets() {
    return screen.findByText(/No browser targets/);
  },
  get savedChoice() {
    return screen.findByText(/^Saved choice:/);
  },
  get firefoxButton() {
    return screen.findByRole("button", { name: "Open in Firefox" });
  },
  async logLine(text: RegExp) {
    return screen.findByText(text);
  },
};

// jsdom cannot navigate to an intent:// URL, so location.assign is a stub.
const assign = vi.fn<(url: string) => void>();

describe("/dev/external-links", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_MODE", "mock");
    vi.stubGlobal("location", {
      origin: window.location.origin,
      href: window.location.href,
      search: "",
      assign,
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
    assign.mockReset();
  });

  it("says when there is no browser to test", async () => {
    renderApp({ url: "/dev/external-links" });

    expect(await ui.noTargets).toBeInTheDocument();
    expect(await ui.savedChoice).toHaveTextContent("n/a");
  });

  it("opens the test URL in each browser and logs the result", async () => {
    window.sessionStorage.setItem("lire.twa", "true");
    renderApp({ url: "/dev/external-links" });

    expect(await ui.savedChoice).toHaveTextContent("default");
    await userEvent.click(await ui.firefoxButton);
    expect(assign).toHaveBeenCalledWith(expect.stringContaining("browser=org.mozilla.firefox"));
    expect(await ui.logLine(/Firefox: sent/)).toBeInTheDocument();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await ui.logLine(/visibility: visible/)).toBeInTheDocument();
  });
});
