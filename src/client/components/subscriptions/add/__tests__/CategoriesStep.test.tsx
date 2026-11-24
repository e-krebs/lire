import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { CategoriesStep } from "client/components/subscriptions/add/AddFeed/CategoriesStep";
import { stepFormId } from "client/components/subscriptions/add/AddFeed/shared";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";
import { seedCategoryId } from "test/seedCategories";
import type { Category } from "shared/feedsApi/types";

const SLOW = { timeout: 10_000 };

const TECH = seedCategoryId("Tech");
const CATEGORIES: Category[] = [
  { id: TECH, label: "Tech", feedIds: [] },
  { id: seedCategoryId("Design"), label: "Design", feedIds: [] },
];

const Harness = ({
  selected,
  error,
  pickError,
  onChange,
  onSubmit,
}: {
  selected: string[];
  error: string | null;
  onChange: (selected: string[]) => void;
  pickError?: string;
  onSubmit: () => boolean;
}) => {
  const [value, setValue] = useState(selected);
  return (
    <>
      <CategoriesStep
        categories={CATEGORIES}
        selected={value}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
        error={error}
        pickError={pickError}
        onSubmit={onSubmit}
      />
      <button type="submit" form={stepFormId("categories")}>
        Subscribe
      </button>
    </>
  );
};

const ui = {
  filter() {
    return screen.getByRole("searchbox", { name: "Filter categories" });
  },
  createOption(name: string) {
    return screen.getByRole("button", { name: `Create “${name}”` });
  },
  subscribe() {
    return screen.getByRole("button", { name: "Subscribe" });
  },
  firstCategory() {
    return screen.getAllByRole("checkbox")[0];
  },
  queryAlert() {
    return screen.queryByRole("alert");
  },
  queryPickHint() {
    return screen.queryByText("Pick at least one category for this feed.");
  },
  async findAlert() {
    return screen.findByRole("alert", {}, SLOW);
  },
};

const setup = (
  props: { selected?: string[]; error?: string | null; pickError?: string; accepts?: boolean } = {},
) => {
  const onChange = vi.fn<(selected: string[]) => void>();
  const onSubmit = vi.fn<() => boolean>(() => props.accepts ?? true);
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness
        selected={props.selected ?? []}
        error={props.error ?? null}
        pickError={props.pickError}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </QueryClientProvider>,
  );
  return { ui, user, onChange, onSubmit };
};

describe("CategoriesStep", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_MODE", "real");
    server.use(fixtureBackend);
    resetFixtureState();
  });

  describe("when a typed name matches no category", () => {
    it("creates the category and ticks it alongside the existing picks", async () => {
      const { ui, user, onChange } = setup({ selected: [TECH] });

      await user.type(ui.filter(), "Podcasts");
      await user.click(ui.createOption("Podcasts"));

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith([TECH, expect.any(String)]);
      }, SLOW);
    });

    it("shows the create failure when the category is refused", async () => {
      server.use(
        http.post("/api/categories", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
      );
      const { ui, user, onChange } = setup({ selected: [TECH] });

      await user.type(ui.filter(), "Podcasts");
      await user.click(ui.createOption("Podcasts"));

      expect(await ui.findAlert()).toHaveTextContent("Could not create that category.");
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("when the parent passes a subscribe error", () => {
    it("shows that error", () => {
      setup({ selected: [TECH], error: "Could not subscribe. Network down" });

      expect(ui.queryAlert()).toHaveTextContent("Could not subscribe. Network down");
    });
  });

  describe("when no category is picked", () => {
    it("asks for at least one and shows no alert", () => {
      setup();

      expect(ui.queryPickHint()).toBeInTheDocument();
      expect(ui.queryAlert()).toBeNull();
    });
  });

  describe("when Subscribe was pressed with nothing picked", () => {
    it("shows the pick error as an alert", () => {
      setup({ pickError: "Pick at least one category for this feed." });

      expect(ui.queryAlert()).toHaveTextContent("Pick at least one category");
    });

    it("focuses the first category when the submit is refused", async () => {
      const { ui, user } = setup({ accepts: false });

      await user.click(ui.subscribe());

      expect(ui.firstCategory()).toHaveFocus();
    });
  });

  describe("when the form is submitted", () => {
    it("calls onSubmit once", async () => {
      const { ui, user, onSubmit } = setup({ selected: [TECH] });

      await user.click(ui.subscribe());

      expect(onSubmit).toHaveBeenCalledOnce();
    });
  });
});
