import { render, screen } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRoute,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { Route } from "client/routes/stream.$streamKey.entry.$entryId";

const Broken = () => {
  throw new Error("entry failed");
};

const ui = {
  get alert() {
    return screen.findByRole("alert");
  },
  get reloadButton() {
    return screen.getByRole("button", { name: "Reload the page" });
  },
  get backLink() {
    return screen.getByRole("link", { name: "Go back" });
  },
};

// The real errorComponent renders in place of a route that throws, so a throwing stand-in
// route supplies the error prop without a mock.
const setup = ({ streamKey }: { streamKey: string }) => {
  const root = createRootRoute({ component: Outlet });
  const stream = createRoute({
    getParentRoute: () => root,
    path: "/stream/$streamKey",
    component: Outlet,
  });
  const entry = createRoute({
    getParentRoute: () => root,
    path: "/stream/$streamKey/entry/$entryId",
    component: Broken,
    errorComponent: Route.options.errorComponent,
  });
  const router = createRouter({
    routeTree: root.addChildren([stream, entry]),
    history: createMemoryHistory({ initialEntries: [`/stream/${streamKey}/entry/7`] }),
  });
  return router;
};

describe("/stream/$streamKey/entry/$entryId error screen", () => {
  it("shows the error alert, a reload button and a way back to the stream", async () => {
    const router = setup({ streamKey: "all" });
    await router.load();
    render(<RouterProvider router={router} />);

    expect(await ui.alert).toHaveTextContent("Something went wrong.");
    expect(ui.reloadButton).toBeInTheDocument();
    expect(ui.backLink).toHaveAttribute("href", "/stream/all");
  });
});
