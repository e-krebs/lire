import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionsManager } from "client/components/subscriptions/SubscriptionsManager";
import {
  panelOf,
  searchOf,
  text,
  type SubscriptionsSearch,
} from "client/utils/subscriptionsSearch";
import { noViewTransitionRunning } from "client/utils/viewTransition";

export const Route = createFileRoute("/subscriptions")({
  validateSearch: (search: Record<string, unknown>): SubscriptionsSearch => {
    const tab = search.tab === "feeds" || search.tab === "categories" ? search.tab : undefined;
    const add = search.add === true ? true : text(search.add);
    const newsletter = search.newsletter === true ? true : text(search.newsletter);
    return {
      tab,
      ...searchOf(
        panelOf({ feed: text(search.feed), category: text(search.category), add, newsletter }),
      ),
    };
  },
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Replace, not push: the top bar's Back leaves the page instead of replaying every panel.
  return (
    <div className="subscriptions relative h-full">
      <SubscriptionsManager
        tab={search.tab ?? "feeds"}
        panel={panelOf(search)}
        onTabChange={(tab) => {
          void navigate({
            search: (prev) => ({ ...prev, tab, ...searchOf(undefined) }),
            replace: true,
          });
        }}
        // A view transition morphs the row's name into the panel heading and back (styles.css).
        onPanelChange={(panel) => {
          void navigate({
            search: (prev) => ({ ...prev, ...searchOf(panel) }),
            replace: true,
            viewTransition: noViewTransitionRunning(),
          });
        }}
      />
    </div>
  );
}
