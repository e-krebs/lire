import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { renderApp } from "test/renderApp";

const ui = {
  async findHeading(name: string) {
    return screen.findByRole("heading", { name });
  },
  get tab() {
    return screen.queryByRole("tab");
  },
};

describe("/subscriptions/add", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_MODE", "mock");
    resetFixtureState();
  });

  it("opens on the first step, outside the subscriptions page", async () => {
    const { router } = renderApp({ url: "/subscriptions/add" });

    expect(await ui.findHeading("Find")).toBeInTheDocument();
    expect(router.state.matches.map((match) => match.routeId)).not.toContain("/subscriptions");
    expect(ui.tab).toBeNull();
  });

  it("falls back to the first step for an unknown step", async () => {
    const { router } = renderApp({ url: "/subscriptions/add?step=nope" });

    expect(await ui.findHeading("Find")).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ step: "find" });
  });

  it("replaces a deep link to a later step with the first one", async () => {
    const { router } = renderApp({ url: "/subscriptions/add?step=categories" });

    expect(await ui.findHeading("Find")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(router.state.location.search).toMatchObject({ step: "find" });
    });
    expect(router.history.length).toBe(1);
  });
});
