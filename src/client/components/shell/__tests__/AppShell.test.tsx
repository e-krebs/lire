import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { useOverlay } from "client/hooks/useOverlay";
import { AppShell } from "../AppShell";

const ui = {
  async skipLink(view: RenderResult) {
    return view.findByRole("link", { name: "Skip to content" });
  },
};

const setup = ({ overlayOpen }: { overlayOpen: boolean }) => {
  vi.stubEnv("VITE_API_MODE", "mock");
  resetFixtureState();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
        <OpenOverlay open={overlayOpen} />
      </AppShell>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

const OpenOverlay = ({ open }: { open: boolean }) => {
  useOverlay({ id: "account-menu", isOpen: open });
  return null;
};

describe("AppShell", () => {
  describe("when a panel is open", () => {
    it("makes the skip link and the content inert", async () => {
      const view = setup({ overlayOpen: true });

      expect(await ui.skipLink(view)).toHaveAttribute("inert");
      expect(view.container.querySelector("main")).toHaveAttribute("inert");
    });
  });

  describe("when nothing is open", () => {
    it("leaves both live while nothing is open", async () => {
      const view = setup({ overlayOpen: false });

      expect(await ui.skipLink(view)).not.toHaveAttribute("inert");
      expect(view.container.querySelector("main")).not.toHaveAttribute("inert");
    });
  });
});
