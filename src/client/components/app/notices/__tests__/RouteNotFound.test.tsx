import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { RouteNotFound } from "client/components/app/notices/RouteNotFound";
import { setLocalePreference } from "client/i18n/locale";

const renderNotFound = async () => {
  const router = createRouter({
    routeTree: createRootRoute({ component: RouteNotFound }),
    history: createMemoryHistory({ initialEntries: ["/missing"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
};

const ui = {
  text(text: string) {
    return screen.getByText(text);
  },
  link(name: string) {
    return screen.getByRole("link", { name });
  },
  get alert() {
    return screen.queryByRole("alert");
  },
};

describe("RouteNotFound", () => {
  it("shows the title and a link home in English", async () => {
    await renderNotFound();

    expect(ui.text("This page doesn't exist.")).toBeInTheDocument();
    expect(ui.link("Back to home")).toHaveAttribute("href", "/");
    expect(ui.alert).not.toBeInTheDocument();
  });

  it("shows the title and link in French", async () => {
    setLocalePreference("fr");
    await renderNotFound();

    expect(ui.text("Cette page n'existe pas.")).toBeInTheDocument();
    expect(ui.link("Retour à l'accueil")).toHaveAttribute("href", "/");
    setLocalePreference("en");
  });
});
