import { createRouter } from "@tanstack/react-router";
import { RouteError } from "client/components/app/notices/RouteError";
import { RouteNotFound } from "client/components/app/notices/RouteNotFound";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: RouteNotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
