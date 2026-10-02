import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { catalogs } from "client/i18n/messages";
import { setLocalePreference } from "client/i18n/locale";
import type { Collection, Subscription } from "shared/feedsApi/types";
import { CategoryPicker } from "../CategoryPicker";
import { DeleteCategoryDialog } from "../DeleteCategoryDialog";
import { FeedsTab } from "../FeedsTab";

const DESIGN: Collection = { id: "design", label: "Design", feeds: [] };
const NEWS: Collection = { id: "news", label: "News", feeds: [] };

const subscription = (index: number, categories: Collection[]): Subscription => ({
  id: `feed/${index}`,
  title: `Feed ${index}`,
  categories: categories.map(({ id, label }) => ({ id, label })),
});

const SUBSCRIPTIONS = [
  subscription(1, [DESIGN, NEWS]),
  subscription(2, [DESIGN]),
  subscription(3, [NEWS]),
];

const ui = {
  text(content: string) {
    return screen.getByText(content);
  },
  heading(name: string) {
    return screen.getByRole("heading", { name });
  },
  placeholder(text: string) {
    return screen.getByPlaceholderText(text);
  },
  dialog(name: string) {
    return screen.getByRole("dialog", { name });
  },
  button(name: string) {
    return screen.getByRole("button", { name });
  },
};

describe("subscriptions in French", () => {
  it("counts zero results as singular", () => {
    expect(catalogs.fr.subscriptions.resultCount({ count: 0 })).toBe("0 résultat");
  });

  describe("when listing the feeds", () => {
    it("pluralizes the summary", () => {
      setLocalePreference("fr");
      render(
        <FeedsTab
          subscriptions={SUBSCRIPTIONS}
          collections={[DESIGN, NEWS]}
          openFeedId={undefined}
          onOpenFeed={() => undefined}
          onAddWebsite={() => undefined}
          onAddNewsletter={() => undefined}
        />,
      );

      expect(ui.text("3 flux, dont 1 dans plusieurs catégories")).toBeInTheDocument();
    });
  });

  describe("when picking categories", () => {
    it("interpolates the counts", () => {
      setLocalePreference("fr");
      render(
        <CategoryPicker
          categories={[DESIGN, NEWS]}
          selected={["design"]}
          onChange={() => undefined}
          mode="multiple"
        />,
      );

      expect(ui.heading("Catégories · 1 sur 2")).toBeInTheDocument();
      expect(ui.placeholder("Filtrer 2 catégories…")).toBeInTheDocument();
    });
  });

  describe("when deleting a category", () => {
    const setup = (subscriptions: Subscription[]) => {
      setLocalePreference("fr");
      render(
        <QueryClientProvider client={new QueryClient()}>
          <DeleteCategoryDialog
            open
            category={DESIGN}
            collections={[DESIGN, NEWS]}
            subscriptions={subscriptions}
            onCancel={() => undefined}
            onDeleted={() => undefined}
          />
        </QueryClientProvider>,
      );
    };

    it("explains a mix of shared and orphan feeds", () => {
      setup([
        subscription(1, [DESIGN, NEWS]),
        subscription(2, [DESIGN]),
        subscription(3, [DESIGN]),
      ]);

      expect(
        ui.text(
          "1 de ses 3 flux figure dans une autre catégorie et perd seulement celle-ci. Les 2 autres n'ont aucune autre catégorie, il leur en faut une nouvelle.",
        ),
      ).toBeInTheDocument();
      expect(ui.dialog("Supprimer Design ?")).toBeInTheDocument();
      expect(ui.button("Supprimer et déplacer 2 flux")).toBeInTheDocument();
    });

    it("uses the singular for a single orphan", () => {
      setup([subscription(1, [DESIGN])]);

      expect(
        ui.text("Son unique flux n'a aucune autre catégorie, il lui en faut une nouvelle."),
      ).toBeInTheDocument();
      expect(ui.button("Supprimer et déplacer 1 flux")).toBeInTheDocument();
    });
  });
});
