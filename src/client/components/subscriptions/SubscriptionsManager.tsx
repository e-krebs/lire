import { useState } from "react";
import { useCategories, useFeeds, useOrderedCategories, useSavingFeed } from "client/api/queries";
import { feedsInCategory } from "client/api/selectors";
import { CategoriesTab } from "client/components/subscriptions/CategoriesTab";
import { CategoryPanel } from "client/components/subscriptions/CategoryPanel";
import { EmptyCategoryPanel } from "client/components/subscriptions/EmptyCategoryPanel";
import { FeedPanel } from "client/components/subscriptions/FeedPanel";
import { FeedsTab } from "client/components/subscriptions/FeedsTab";
import { NewsletterPanel } from "client/components/subscriptions/NewsletterPanel";
import { PanelExitContext, markPanelOrigin } from "client/components/subscriptions/SidePanel";
import { SubscribePanel } from "client/components/subscriptions/SubscribePanel";
import { Tabs, tabId, tabPanelId } from "client/components/subscriptions/Tabs";
import { useT } from "client/i18n/useT";

export type SubscriptionsTab = "categories" | "feeds";

export type SubscriptionsPanel =
  | { kind: "feed"; feedId: string }
  | { kind: "category"; categoryId: string }
  | { kind: "add"; categoryId: string | undefined }
  | { kind: "newsletter"; categoryId: string | undefined };

const panelKey = (panel: SubscriptionsPanel | undefined): string | undefined =>
  panel === undefined
    ? undefined
    : `${panel.kind}:${(panel.kind === "feed" ? panel.feedId : panel.categoryId) ?? ""}`;

interface SubscriptionsManagerProps {
  /** Selected tab. */
  tab: SubscriptionsTab;
  /** Side panel to show, if any. */
  panel: SubscriptionsPanel | undefined;
  /** Tab selected. */
  onTabChange: (tab: SubscriptionsTab) => void;
  /** Panel opened, switched or closed (undefined). */
  onPanelChange: (panel: SubscriptionsPanel | undefined) => void;
}

const CategoryRowsSkeleton = () => {
  const t = useT().subscriptions;
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t.loadingCategories}
      className="flex flex-col gap-2"
    >
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-12 rounded-xl bg-surface-2 motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
};

// Renders the list's scroll pane and the side panel as siblings, so the caller's `relative h-full`
// box anchors the panel while the list scrolls under it.
export const SubscriptionsManager = ({
  tab,
  panel,
  onTabChange,
  onPanelChange,
}: SubscriptionsManagerProps) => {
  const t = useT().subscriptions;
  const categoriesQuery = useCategories();
  const feedsQuery = useFeeds();
  const { categories: categoryList, ready: categoriesReady } = useOrderedCategories();
  const feedList = feedsQuery.data ?? [];
  const savingFeed = useSavingFeed();
  const loadError = categoriesQuery.error ?? feedsQuery.error;

  // A panel that just closed stays up while it plays its exit (SidePanel), then unmounts. Opening
  // one meanwhile drops it, or takes it back if it is the same one.
  const [lastPanel, setLastPanel] = useState(panel);
  const [closing, setClosing] = useState<SubscriptionsPanel | undefined>(undefined);
  if (panelKey(panel) !== panelKey(lastPanel)) {
    setLastPanel(panel);
    setClosing(panel === undefined ? lastPanel : undefined);
  }
  const shownPanel = panel ?? closing;

  const closePanel = (): void => {
    onPanelChange(undefined);
  };
  const openFeed =
    shownPanel?.kind === "feed"
      ? feedList.find((feed) => feed.id === shownPanel.feedId)
      : undefined;
  const openCategory =
    shownPanel?.kind === "category"
      ? categoryList.find((category) => category.id === shownPanel.categoryId)
      : undefined;
  const addPanel =
    shownPanel?.kind === "add" && categoriesQuery.data !== undefined ? shownPanel : undefined;
  const newsletterPanel = shownPanel?.kind === "newsletter" ? shownPanel : undefined;
  // Gone meanwhile, e.g. an unsubscribed feed: nothing is left to animate.
  if (
    closing !== undefined &&
    openFeed === undefined &&
    openCategory === undefined &&
    !addPanel &&
    !newsletterPanel
  ) {
    setClosing(undefined);
  }
  const openFeedPanel = (feedId: string): void => {
    onPanelChange({ kind: "feed", feedId });
  };
  // Not opened from a row, so no row name morphs into its heading.
  const openSubscribe = (categoryId: string | undefined): void => {
    markPanelOrigin(null);
    onPanelChange({ kind: "add", categoryId });
  };
  const openNewsletter = (categoryId: string | undefined): void => {
    markPanelOrigin(null);
    onPanelChange({ kind: "newsletter", categoryId });
  };

  return (
    <>
      {/* Inert while a panel is open: the panel's scrim sits over it, and the keyboard can't
          reach it either. */}
      <div
        className="h-full scroll-pane lg:data-panel-open:pr-[var(--side-panel-width)]"
        data-panel-open={shownPanel === undefined ? undefined : ""}
        inert={shownPanel === undefined ? undefined : true}
      >
        {/* Left-aligned on tablet, so the floating panel covers as little of the list as it can.
            Centred on desktop at the top bar search pill's `max-w-2xl`, in the space left of the
            panel while one is open. The page title lives in the top bar beside its Back button, so
            it isn't repeated here. */}
        <div
          className={`
            mx-auto flex max-w-xl flex-col gap-4 px-4 py-6
            sm:mx-0 sm:px-6
            lg:mx-auto lg:max-w-2xl
          `}
        >
          <Tabs
            label={t.tabsLabel}
            tabs={[
              { id: "categories", label: t.tabCategories, count: categoryList.length },
              { id: "feeds", label: t.tabFeeds, count: feedList.length },
            ]}
            selected={tab}
            onSelect={onTabChange}
          />
          {loadError === null ? null : (
            <p role="alert" className="text-sm text-danger">
              {t.loadFailed({ message: loadError.message })}
            </p>
          )}
          <div role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabId(tab)}>
            {tab === "categories" && !categoriesReady ? (
              <CategoryRowsSkeleton />
            ) : tab === "categories" ? (
              <CategoriesTab
                categories={categoryList}
                openCategoryId={panel?.kind === "category" ? panel.categoryId : undefined}
                onOpenCategory={(categoryId) => {
                  onPanelChange({ kind: "category", categoryId });
                }}
              />
            ) : (
              <FeedsTab
                feeds={feedList}
                categories={categoryList}
                openFeedId={panel?.kind === "feed" ? panel.feedId : undefined}
                onOpenFeed={openFeedPanel}
                onAddWebsite={() => {
                  openSubscribe(undefined);
                }}
                onAddNewsletter={() => {
                  openNewsletter(undefined);
                }}
              />
            )}
          </div>
        </div>
      </div>
      <PanelExitContext
        value={
          closing === undefined
            ? null
            : () => {
                setClosing(undefined);
              }
        }
      >
        {openFeed === undefined ? null : (
          <FeedPanel feed={openFeed} categories={categoryList} onClose={closePanel} />
        )}
        {/* Waits for the feeds, so a loading list never reads as an empty category. Swaps to the
          empty panel once the last feed leaves, but not while its removal saves: the swap would
          unmount the save, and a failure would come back with no message. */}
        {openCategory === undefined || feedsQuery.data === undefined ? null : !savingFeed &&
          feedsInCategory({
            feeds: feedList,
            categoryId: openCategory.id,
          }).length === 0 ? (
          <EmptyCategoryPanel
            key={openCategory.id}
            category={openCategory}
            categories={categoryList}
            allFeeds={feedList}
            onClose={closePanel}
            onAddWebsite={() => {
              openSubscribe(openCategory.id);
            }}
            onAddNewsletter={() => {
              openNewsletter(openCategory.id);
            }}
          />
        ) : (
          <CategoryPanel
            key={openCategory.id}
            category={openCategory}
            categories={categoryList}
            allFeeds={feedList}
            onClose={closePanel}
            onOpenFeed={openFeedPanel}
            onAddWebsite={() => {
              openSubscribe(openCategory.id);
            }}
            onAddNewsletter={() => {
              openNewsletter(openCategory.id);
            }}
          />
        )}
        {/* Waits for the categories, so the preselected one is known on mount. */}
        {addPanel === undefined ? null : (
          <SubscribePanel
            key={addPanel.categoryId ?? ""}
            categories={categoryList}
            categoryId={addPanel.categoryId}
            onClose={closePanel}
          />
        )}
        {newsletterPanel === undefined ? null : <NewsletterPanel onClose={closePanel} />}
      </PanelExitContext>
    </>
  );
};
