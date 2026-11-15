import { useEffect, useRef } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useViewPrefs } from "client/utils/viewPrefs";
import { parseStreamKey } from "shared/feedsApi/streamKey";
import { unreadCountFor, useCounts } from "client/api/queries";
import { categoryStreamKey, feedStreamKey } from "client/hooks/useNavigatorModel";
import type { NavigatorModel } from "client/hooks/useNavigatorModel";
import { Icon } from "client/components/primitives/icons/icons";
import { useT } from "client/i18n/useT";
import { CategoryResultRow } from "client/components/browse-menu/rows/CategoryResultRow";
import { CategoryRowsSkeleton } from "./CategoryRowsSkeleton";
import { CategoryTreeRow } from "client/components/browse-menu/rows/CategoryTreeRow";
import { FeedRow } from "client/components/browse-menu/rows/FeedRow";
import { SearchResultRow } from "client/components/browse-menu/rows/SearchResultRow";
import {
  SUBSCRIPTIONS_ROW_KEY,
  builtInIconClassName,
  builtInRowClassName,
  categoryRowKey,
  countBadgeClassName,
  feedRowKey,
  sectionHeadingClassName,
} from "client/components/browse-menu/rows/shared";

interface NavigatorPanelProps {
  model: NavigatorModel;
  /** Display label of the search scope, for the search row's second line. */
  scopeLabel: string;
  /** Panel should close, e.g. after a selection. */
  onClose: () => void;
}

// The tree/results/row-actions body, shared by the phone bottom sheet and the desktop/tablet
// omnibox popover — both mount this once they're open and drive it through the same model and
// keyboard events, so the two surfaces behave identically.
export const NavigatorPanel = ({ model, scopeLabel, onClose }: NavigatorPanelProps) => {
  const t = useT().navigation;
  const params = useParams({ strict: false });
  const unreadOnly = useViewPrefs().unread;

  const {
    query,
    selectedIndex,
    activeIndex,
    selectedBrowseKey,
    expandedIds,
    toggleExpanded,
    categoriesReady,
    visibleCategories,
    feedsInCategory,
    canExpand,
    trimmedQuery,
    leadingRows,
    categoryMatches,
    feedMatches,
    noMatches,
    goToKey,
    activate,
  } = model;
  const counts = useCounts();

  const currentStreamKey = params.streamKey;
  const currentStream = currentStreamKey === undefined ? null : parseStreamKey(currentStreamKey);
  const currentIsAll = currentStream?.kind === "all";
  const currentIsRead = currentStream?.kind === "read";

  // Scrolling the highlighted row back into the viewport drives a DOM node the render doesn't
  // own; jsdom has no scrollIntoView, hence the same feature check the Navigator surfaces use.
  // The last row lives in the footer, outside the scroller, so both are searched.
  const listRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row =
      listRef.current?.querySelector("[data-selected]") ??
      footerRef.current?.querySelector("[data-selected]");
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, query]);

  const globalCount = unreadCountFor({ counts: counts.data, streamKey: "all" });

  // Closes over most of the panel's state, so a component would take about 14 props.
  // oxlint-disable-next-line code-conventions/no-render-helper
  const browseTree = (
    <div>
      <button
        type="button"
        data-current={currentIsAll || undefined}
        data-selected={selectedBrowseKey === "all" || undefined}
        onClick={() => {
          goToKey("all");
        }}
        className={builtInRowClassName}
      >
        {/* The same 24px footprint as a tree row's twisty, so the labels line up. */}
        <span className={builtInIconClassName}>
          {unreadOnly ? (
            <Icon name="unread-only" className="size-4" />
          ) : (
            <Icon name="everything" className="size-4" />
          )}
        </span>
        <span
          data-tip={t.allArticles}
          data-tip-overflow=""
          className="min-w-0 flex-1 truncate text-sm group-data-current:text-accent-text"
        >
          {t.allArticles}
        </span>
        {globalCount > 0 ? <span className={countBadgeClassName}>{globalCount}</span> : null}
      </button>
      <button
        type="button"
        data-current={currentIsRead || undefined}
        data-selected={selectedBrowseKey === "read" || undefined}
        onClick={() => {
          goToKey("read");
        }}
        className={builtInRowClassName}
      >
        <span className={builtInIconClassName}>
          <Icon name="history" className="size-4" />
        </span>
        <span
          data-tip={t.recentlyRead}
          data-tip-overflow=""
          className="min-w-0 flex-1 truncate text-sm group-data-current:text-accent-text"
        >
          {t.recentlyRead}
        </span>
      </button>

      {categoriesReady ? null : <CategoryRowsSkeleton />}
      {visibleCategories.map((category) => {
        const collapsed = !expandedIds.has(category.id);
        const feeds = feedsInCategory(category.id);
        return (
          <div key={category.id} className="mt-0.5">
            <CategoryTreeRow
              category={category}
              count={unreadCountFor({
                counts: counts.data,
                streamKey: categoryStreamKey(category.id),
              })}
              isCurrent={currentStreamKey === categoryStreamKey(category.id)}
              collapsed={collapsed}
              expandable={canExpand(feeds)}
              selected={selectedBrowseKey === categoryRowKey(category.id)}
              onToggleCollapse={() => {
                toggleExpanded(category.id);
              }}
              onSelect={() => {
                goToKey(categoryStreamKey(category.id));
              }}
              onClose={onClose}
            />
            {collapsed ? null : (
              <div className="flex flex-col pl-5">
                {feeds.map((feed) => (
                  <FeedRow
                    key={feed.id}
                    feed={feed}
                    count={unreadCountFor({
                      counts: counts.data,
                      streamKey: feedStreamKey(feed.id),
                    })}
                    isCurrent={currentStreamKey === feedStreamKey(feed.id)}
                    selected={selectedBrowseKey === feedRowKey(feed.id)}
                    onSelect={() => {
                      goToKey(feedStreamKey(feed.id));
                    }}
                    onClose={onClose}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* `flex-auto`, not `flex-1`: a 0% basis inside a max-height-only column collapses the
            list to nothing in older WebKit, leaving the footer link alone on an iPad. With the bar
            at the bottom the rows gather next to the field below them: `margin-top: auto` on the
            content, not `justify-content: end`, so an overflowing list still scrolls to its top. */}
      <div
        ref={listRef}
        className={`
            min-h-0 flex-auto overflow-y-auto px-2.5 pt-2 pb-1
            bar-bottom:flex bar-bottom:flex-col bar-bottom:*:mt-auto
          `}
      >
        {trimmedQuery === "" ? (
          browseTree
        ) : (
          <div className="flex flex-col gap-3">
            <SearchResultRow
              query={trimmedQuery}
              scopeLabel={scopeLabel}
              selected={activeIndex === 0}
              onSelect={() => {
                activate({ kind: "search" });
              }}
            />

            <div>
              <p className={sectionHeadingClassName}>{t.matches}</p>
              {noMatches ? (
                <p className="p-2 text-sm text-faint">{t.noMatches({ query: trimmedQuery })}</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {categoryMatches.map((category, index) => (
                    <CategoryResultRow
                      key={category.id}
                      category={category}
                      count={unreadCountFor({
                        counts: counts.data,
                        streamKey: categoryStreamKey(category.id),
                      })}
                      isCurrent={currentStreamKey === categoryStreamKey(category.id)}
                      selected={activeIndex === leadingRows + index}
                      matchQuery={trimmedQuery}
                      onSelect={() => {
                        goToKey(categoryStreamKey(category.id));
                      }}
                      onClose={onClose}
                    />
                  ))}
                  {feedMatches.map((feed, index) => (
                    <FeedRow
                      key={feed.id}
                      feed={feed}
                      count={unreadCountFor({
                        counts: counts.data,
                        streamKey: feedStreamKey(feed.id),
                      })}
                      isCurrent={currentStreamKey === feedStreamKey(feed.id)}
                      matchQuery={trimmedQuery}
                      selected={activeIndex === leadingRows + categoryMatches.length + index}
                      onSelect={() => {
                        goToKey(feedStreamKey(feed.id));
                      }}
                      onClose={onClose}
                    />
                  ))}
                </div>
              )}
            </div>

            <hr className="border-hairline" />
            {browseTree}
          </div>
        )}
      </div>

      {trimmedQuery === "" ? (
        <div
          ref={footerRef}
          className={`
              flex flex-none flex-col border-t border-hairline px-2.5 py-1.5
              pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))]
              bar-bottom:pb-1.5
            `}
        >
          <Link
            to="/subscriptions"
            onClick={onClose}
            data-selected={selectedBrowseKey === SUBSCRIPTIONS_ROW_KEY || undefined}
            className={`
                block w-full cursor-pointer rounded-md px-2 py-2.5 text-left text-sm font-medium
                text-muted
                hover:bg-surface-2
                data-selected:bg-accent-soft
                data-selected:shadow-[inset_0_0_0_1.5px_var(--color-accent)]
              `}
          >
            {t.manageSubscriptions}
          </Link>
        </div>
      ) : null}
    </>
  );
};
NavigatorPanel.displayName = "NavigatorPanel";
