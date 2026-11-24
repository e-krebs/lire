import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http, type HttpHandler } from "msw";
import { describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { Route } from "client/routes/subscriptions_.add";
import { fixtureBackend } from "test/fixtureBackend";
import { renderApp } from "test/renderApp";
import { server } from "test/msw";

const ui = {
  get find() {
    return screen.queryByRole("heading", { name: "Find" });
  },
  async findUrl() {
    return screen.findByRole("textbox", { name: "Feed or site URL" });
  },
  get next() {
    return screen.getByRole("button", { name: "Next" });
  },
  get previous() {
    return screen.getByRole("button", { name: "Previous" });
  },
  get cancel() {
    return screen.getByRole("button", { name: "Cancel" });
  },
  get subscribe() {
    return screen.getByRole("button", { name: "Subscribe" });
  },
  get tech() {
    return screen.getByRole("checkbox", { name: "Tech" });
  },
  async findHeading(name: string) {
    return screen.findByRole("heading", { name });
  },
  async findText(text: string) {
    return screen.findByText(text);
  },
  async findPreviewResult() {
    return screen.findByText("Example Tech Daily");
  },
};

const setup = ({
  url = "/subscriptions/add",
  categories,
}: { url?: string; categories?: HttpHandler } = {}) => {
  vi.stubEnv("VITE_API_MODE", "real");
  server.use(fixtureBackend);
  if (categories) server.use(categories);
  resetFixtureState();
  const user = userEvent.setup();
  const { router } = renderApp({ url });
  return { ui, user, router };
};

describe("/subscriptions/add route", () => {
  describe("when the search is validated", () => {
    const validateSearch = Route.options.validateSearch;
    if (typeof validateSearch !== "function") throw new Error("validateSearch is not a function");
    const validate = validateSearch;

    it("keeps a known step and a string category", () => {
      expect(validate({ step: "categories", category: "cat-1" })).toEqual({
        step: "categories",
        category: "cat-1",
      });
    });

    it("falls back to the first step when the step is missing or unknown", () => {
      expect(validate({})).toEqual({ step: "find", category: undefined });
      expect(validate({ step: 42 })).toEqual({ step: "find", category: undefined });
    });

    it("drops a category that is not a string", () => {
      expect(validate({ step: "name", category: 7 })).toEqual({
        step: "name",
        category: undefined,
      });
    });
  });

  describe("when the categories are still loading", () => {
    it("shows a loading line in place of the flow", async () => {
      const { ui } = setup({
        categories: http.get("/api/categories", async () => new Promise(() => {})),
      });

      expect(await ui.findText("Loading…")).toBeInTheDocument();
      expect(ui.find).toBeNull();
    });
  });

  describe("when the user moves between steps", () => {
    it("pushes a history entry for each step, and Previous goes back", async () => {
      const { ui, user, router } = setup();

      await user.type(await ui.findUrl(), "tech.example.test");
      await user.click(await ui.findPreviewResult());
      await user.click(ui.next);
      expect(await ui.findHeading("Name and preview")).toBeInTheDocument();
      expect(router.state.location.search).toMatchObject({ step: "name" });

      const length = router.history.length;
      await user.click(ui.previous);

      expect(router.state.location.search).toMatchObject({ step: "find" });
      expect(router.history.length).toBe(length + 1);
    });
  });

  describe("when the feed is subscribed", () => {
    it("leaves the flow with a replace, so Back does not return to the add page", async () => {
      const { ui, user, router } = setup();

      await user.type(await ui.findUrl(), "tech.example.test");
      await user.click(await ui.findPreviewResult());
      await user.click(ui.next);
      await ui.findHeading("Name and preview");
      await user.click(ui.next);
      await user.click(ui.tech);
      const length = router.history.length;
      await user.click(ui.subscribe);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/subscriptions");
      });
      expect(router.history.length).toBe(length);
    });
  });

  describe("when the user cancels on the first step", () => {
    it("leaves for the subscriptions page", async () => {
      const { ui, user, router } = setup();

      await ui.findUrl();
      await user.click(ui.cancel);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/subscriptions");
      });
    });
  });
});
