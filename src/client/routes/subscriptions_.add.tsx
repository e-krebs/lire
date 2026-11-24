import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCategories } from "client/api/queries";
import { AddFeed } from "client/components/subscriptions/add/AddFeed";
import { isStepId, type StepId } from "client/components/subscriptions/add/AddFeed/shared";
import { useT } from "client/i18n/useT";

interface AddSearch {
  step: StepId;
  category?: string;
}

export const Route = createFileRoute("/subscriptions_/add")({
  validateSearch: (search: Record<string, unknown>): AddSearch => ({
    step: isStepId(search.step) ? search.step : "find",
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  component: AddFeedPage,
});

function AddFeedPage() {
  const { common } = useT();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const categories = useCategories();

  if (categories.data === undefined) {
    return <p className="p-4 text-sm text-muted">{common.loading}</p>;
  }

  return (
    <AddFeed
      categories={categories.data}
      categoryId={search.category}
      step={search.step}
      onStepChange={({ step, replace }) => {
        void navigate({ search: (prev) => ({ ...prev, step }), replace });
      }}
      onDone={() => {
        void navigate({ to: "/subscriptions", replace: true });
      }}
      onCancel={() => {
        void navigate({ to: "/subscriptions" });
      }}
    />
  );
}
