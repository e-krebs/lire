import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { BackLink } from "client/components/primitives/controls/BackLink";
import { backButtonClassName } from "client/components/primitives/controls/backButtonClassName";

const ui = {
  get link() {
    return screen.getByRole("link", { name: "Back to sign in" });
  },
};

const renderBackLink = async () => {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <BackLink>Back to sign in</BackLink>,
    }),
    history: createMemoryHistory({ initialEntries: ["/credits"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
};

describe("BackLink", () => {
  it("links to the landing with the shared back-button classes", async () => {
    await renderBackLink();

    const link = ui.link;
    expect(link).toHaveAttribute("href", "/");
    for (const token of backButtonClassName.split(/\s+/).filter(Boolean)) {
      expect(link).toHaveClass(token);
    }
  });
});
