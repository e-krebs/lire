import { createElement, Fragment } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { useSigninFailure } from "../useSigninFailure";

const ui = {
  get failure() {
    return screen.findByTestId("failure");
  },
};

const SigninFailure = () => {
  const failure = useSigninFailure();
  return createElement("span", { "data-testid": "failure" }, failure ?? "none");
};

const renderAt = (url: string) => {
  const rootRoute = createRootRoute({
    component: () =>
      createElement(Fragment, null, createElement(SigninFailure), createElement(Outlet)),
  });
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
  const routeTree = rootRoute.addChildren([indexRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(createElement(RouterProvider, { router }));
  return { router };
};

describe("useSigninFailure", () => {
  it.each(["failed", "denied", "expired"] as const)(
    "reads %s and removes it from the URL",
    async (failure) => {
      const { router } = renderAt(`/?signin=${failure}`);

      expect(await ui.failure).toHaveTextContent(failure);
      await waitFor(() => {
        expect(router.state.location.search).toEqual({});
      });
    },
  );

  it("ignores unknown values and removes the param", async () => {
    const { router } = renderAt("/?signin=unknown");

    expect(await ui.failure).toHaveTextContent("none");
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });
});
