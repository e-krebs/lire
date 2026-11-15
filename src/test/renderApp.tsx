import { render } from "@testing-library/react";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouteError } from "client/components/app/notices/RouteError";
import { RouteNotFound } from "client/components/app/notices/RouteNotFound";
import { routeTree } from "client/routeTree.gen";

export const renderApp = ({ url, queryClient }: { url: string; queryClient?: QueryClient }) => {
  const client = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: RouteNotFound,
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient: client, view };
};
