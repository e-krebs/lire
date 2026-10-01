import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator } from "@storybook/react-vite";
import {
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { routeTree } from "../src/client/routeTree.gen";

// The real route tree, so `Link` and `useNavigate` build real hrefs, but no route renders.
export const withRouter: Decorator = (Story) => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return (
    <RouterContextProvider router={router}>
      <Story />
    </RouterContextProvider>
  );
};

// Mock mode is the browser default, so the app's own fixture transport already serves
// fixtures/seed; only the client needs to be fresh per story.
export const withQueryClient: Decorator = function WithQueryClient(Story) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <Story />
    </QueryClientProvider>
  );
};

// For components that read route params or search (`useParams`, `useSearch`): they need a rendered
// match, so the story is the root route's component instead of a sibling of the router.
export const withRouteMatch: Decorator = function WithRouteMatch(Story) {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute({ component: () => <Story /> }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    }),
  );
  return <RouterProvider router={router} />;
};

// Like `withRouteMatch`, but starting at `parameters.url` (default "/") with the stream and
// Subscriptions paths known, so `useParams`, `useSearch` and `useLocation` see a real match and
// navigations resolve.
export const withUrl: Decorator = function WithUrl(Story, { parameters }) {
  const [router] = useState(() => {
    const root = createRootRoute({ component: () => <Story /> });
    return createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: "/" }),
        createRoute({ getParentRoute: () => root, path: "/stream/$streamKey" }),
        createRoute({ getParentRoute: () => root, path: "/subscriptions" }),
      ]),
      history: createMemoryHistory({ initialEntries: [String(parameters.url ?? "/")] }),
    });
  });
  return <RouterProvider router={router} />;
};

export type Tier = "phone" | "desktop";

// useTier reads matchMedia during render, so patching it here is enough; other queries pass through.
export const withTier: Decorator<{ tier: Tier }> = function WithTier(Story, { args }) {
  const original = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    const forced =
      query === "(min-width: 40rem)"
        ? args.tier !== "phone"
        : query === "(min-width: 64rem)"
          ? args.tier === "desktop"
          : undefined;
    if (forced === undefined) return original(query);
    return {
      matches: forced,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      // oxlint-disable-next-line typescript/no-deprecated -- required by MediaQueryList
      addListener: () => {},
      // oxlint-disable-next-line typescript/no-deprecated -- required by MediaQueryList
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  };
  return <Story />;
};
