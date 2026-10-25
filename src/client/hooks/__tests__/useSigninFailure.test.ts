import { createElement, Fragment } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { ApiError } from "client/api/client";
import { useSigninFailure } from "../useSigninFailure";

const ui = {
  get failure() {
    return screen.findByTestId("failure");
  },
  get failureNow() {
    return screen.getByTestId("failure");
  },
};

const SigninFailure = ({ userId }: { userId?: number }) => {
  const failure = useSigninFailure({ userId });
  return createElement("span", { "data-testid": "failure" }, failure ?? "none");
};

const renderAt = (url: string, props: { userId?: number } = {}) => {
  const rootRoute = createRootRoute({
    component: () =>
      createElement(Fragment, null, createElement(SigninFailure, props), createElement(Outlet)),
  });
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
  const routeTree = rootRoute.addChildren([indexRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  const client = new QueryClient();
  render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
  return { router, client };
};

const failQueryWithSignInRequired = (client: QueryClient) => {
  act(() => {
    client
      .getQueryCache()
      .build(client, { queryKey: ["probe"] })
      .setState({
        status: "error",
        error: new ApiError({ status: 401, code: "sign_in_required" }),
      });
  });
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

  it("returns ended when a seen session's query needs a sign-in", async () => {
    const { client } = renderAt("/", { userId: 42 });
    expect(await ui.failure).toHaveTextContent("none");

    failQueryWithSignInRequired(client);

    await waitFor(() => expect(ui.failureNow).toHaveTextContent("ended"));
  });

  it("does not call a fresh visit ended", async () => {
    const { client } = renderAt("/");

    failQueryWithSignInRequired(client);

    expect(await ui.failure).toHaveTextContent("none");
  });
});
