import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useViewPrefs } from "client/utils/viewPrefs";
import { parseStreamKey, toStreamKey } from "shared/feedsApi/streamKey";
import type { Category, Feed } from "shared/feedsApi/types";
import { unreadCountFor, useCounts, useFeeds, useOrderedCategories } from "client/api/queries";
import { Icon } from "client/components/ui/icons";
import { useT } from "client/i18n/useT";
import { CategoryResultRow } from "./CategoryResultRow";
import { CategoryRowsSkeleton } from "./CategoryRowsSkeleton";
import { CategoryTreeRow } from "./CategoryTreeRow";
import { FeedRow } from "./FeedRow";
import { SearchResultRow } from "./SearchResultRow";
import {
  NO_ROW,
  SUBSCRIPTIONS_ROW_KEY,
  builtInIconClassName,
  builtInRowClassName,
  categoryRowKey,
  countBadgeClassName,
  feedRowKey,
  sectionHeadingClassName,
} from "./shared";

type ResultRow =
  | { kind: "search" }
  | { kind: "category"; category: Category }
  | { kind: "feed"; feed: Feed };

const categoryStreamKey = (categoryId: string) =>
  toStreamKey({ kind: "folder", label: categoryId });
const feedStreamKey = (feedId: string) => toStreamKey({ kind: "feed", feedId });

// One visible row of the browse tree, in render order. `expandId` marks the rows that
// ArrowRight/ArrowLeft can open and close; `parentId` is the group a feed row sits in, so
// ArrowLeft can collapse it from the inside. `kind: "link"` is the footer's Manage subscriptions
// entry, which has neither.
interface BrowseRow {
  key: string;
  kind?: "link";
  streamKey?: string;
  expandId?: string;
  parentId?: string;
}

export interface NavigatorPanelHandle {
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

interface NavigatorPanelProps {
  /** Text typed in the location bar field. */
  query: string;
  onQueryChange: (value: string) => void;
  /** Panel should close, e.g. after a selection. */
  onClose: () => void;
  /** Route key of the stream a search is limited to: "all", `folder:<label>` or `feed:<id>`. */
  scopeKey: string;
  /** Display label of that stream, for the search row's second line. */
  scopeLabel: string;
}

// The tree/results/row-actions body, shared by the phone bottom sheet and the desktop/tablet
// omnibox popover — both mount this once they're open and drive it through the same `query` and
// keyboard events, so the two surfaces behave identically.
export const NavigatorPanel = forwardRef<NavigatorPanelHandle, NavigatorPanelProps>(
  ({ query, onQueryChange, onClose, scopeKey, scopeLabel }, ref) => {
    const t = useT().navigation;
    const navigate = useNavigate();
    const params = useParams({ strict: false });
    const unreadOnly = useViewPrefs().unread;

    const { categories: categoryList, ready: categoriesReady } = useOrderedCategories();
    const feedsQuery = useFeeds();
    const counts = useCounts();

    const currentStreamKey = params.streamKey;
    const currentStream = currentStreamKey === undefined ? null : parseStreamKey(currentStreamKey);
    const currentIsAll = currentStream?.kind === "all";
    const currentIsRead = currentStream?.kind === "read";

    // The group the current stream lives in: the category itself, or a feed's first category.
    const currentGroupId = ((): string | undefined => {
      if (currentStream?.kind === "folder") return currentStream.label;
      if (currentStream?.kind !== "feed") return undefined;
      return feedsQuery.data?.find((item) => item.id === currentStream.feedId)?.categoryIds[0];
    })();

    // Browsing starts with no row highlighted: a highlight there reads as "selected" on a touch
    // screen, where no arrow key will ever move it. A typed query highlights its top row, so
    // Enter has a target.
    const initialIndex = (value: string): number => (value.trim() === "" ? NO_ROW : 0);
    const [selectedIndex, setSelectedIndex] = useState(() => initialIndex(query));
    // Groups start collapsed; only the group holding the current stream opens on its own.
    const [expandedIds, setExpandedIds] = useState<Set<string>>(
      () => new Set(currentGroupId === undefined ? [] : [currentGroupId]),
    );

    // Re-selecting the first result on every keystroke belongs to the `query` transition itself,
    // not to an Effect reacting to it afterwards — the react.dev "adjusting state when a prop
    // changes" pattern.
    const [lastQuery, setLastQuery] = useState(query);
    if (query !== lastQuery) {
      setLastQuery(query);
      setSelectedIndex(initialIndex(query));
    }

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

    const toggleExpanded = (id: string): void => {
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    const feedList = feedsQuery.data ?? [];
    // Until the feeds arrive every category may hold feeds, so the twisty stays put rather than
    // flashing in once they load.
    const canExpand = (feeds: Feed[]): boolean => feedsQuery.data === undefined || feeds.length > 0;
    const feedsInCategory = (categoryId: string): Feed[] =>
      feedList.filter((feed) => feed.categoryIds.includes(categoryId));

    const globalCount = unreadCountFor({ counts: counts.data, streamKey: "all" });

    const visibleCategories = categoriesReady ? categoryList : [];
    const trimmedQuery = query.trim();

    const categoryMatches =
      trimmedQuery === ""
        ? []
        : visibleCategories.filter((category) =>
            category.label.toLowerCase().includes(trimmedQuery.toLowerCase()),
          );
    const feedMatches =
      trimmedQuery === ""
        ? []
        : feedList.filter((feed) => feed.title.toLowerCase().includes(trimmedQuery.toLowerCase()));

    // Any typed text leads with the article-search row, so Enter searches straight away and the
    // feed/category matches stay one ArrowDown below.
    const showSearchRow = trimmedQuery !== "";
    const leadingRows = showSearchRow ? 1 : 0;
    const noMatches = categoryMatches.length === 0 && feedMatches.length === 0;

    const results: ResultRow[] = [
      ...(showSearchRow ? [{ kind: "search" as const }] : []),
      ...categoryMatches.map((category) => ({ kind: "category" as const, category })),
      ...feedMatches.map((feed) => ({ kind: "feed" as const, feed })),
    ];

    // The browse tree as the keyboard sees it, in render order. It stays browsable while text is
    // typed, so it is always built and always rendered — below the matches, never instead of them.
    const browseRows: BrowseRow[] = [
      { key: "all", streamKey: "all" },
      { key: "read", streamKey: "read" },
    ];
    for (const category of visibleCategories) {
      const feeds = feedsInCategory(category.id);
      browseRows.push({
        key: categoryRowKey(category.id),
        streamKey: categoryStreamKey(category.id),
        ...(canExpand(feeds) ? { expandId: category.id } : {}),
      });
      if (expandedIds.has(category.id)) {
        for (const feed of feeds) {
          browseRows.push({
            key: feedRowKey(feed.id),
            streamKey: feedStreamKey(feed.id),
            parentId: category.id,
          });
        }
      }
    }
    // The footer link closes the browse order, and exists only while the footer does.
    if (trimmedQuery === "") {
      browseRows.push({ key: SUBSCRIPTIONS_ROW_KEY, kind: "link" });
    }

    // One continuous highlight order: the result rows first (the search row, then the
    // matches), then the browse tree. Collapsing a group shrinks the list under the highlight, so
    // the index is clamped rather than reset — the row that was highlighted keeps its place
    // whenever it survives.
    const totalRows = results.length + browseRows.length;
    // NO_ROW stays NO_ROW: nothing below it resolves to a row.
    const activeIndex = Math.min(selectedIndex, totalRows - 1);
    const selectedBrowseKey =
      activeIndex >= results.length ? browseRows[activeIndex - results.length]?.key : undefined;

    const goToKey = (streamKeyToOpen: string): void => {
      void navigate({
        to: "/stream/$streamKey",
        params: { streamKey: streamKeyToOpen },
        search: (prev) => ({ ...prev, q: undefined }),
      });
      onQueryChange("");
      onClose();
    };

    const activate = (row: ResultRow | undefined): void => {
      if (!row) return;
      if (row.kind === "search") {
        void navigate({
          to: "/stream/$streamKey",
          params: { streamKey: scopeKey },
          search: (prev) => ({ ...prev, q: trimmedQuery }),
        });
        onClose();
        return;
      }
      if (row.kind === "category") {
        goToKey(categoryStreamKey(row.category.id));
        return;
      }
      goToKey(feedStreamKey(row.feed.id));
    };

    const goToSubscriptions = (): void => {
      void navigate({ to: "/subscriptions" });
      onClose();
    };

    useImperativeHandle(ref, () => ({
      handleKeyDown: (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        if (totalRows === 0) return;
        const resultRow = activeIndex < results.length ? results[activeIndex] : undefined;
        const browseIndex = activeIndex - results.length;
        const browseRow = browseIndex < 0 ? undefined : browseRows[browseIndex];

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex(Math.min(activeIndex + 1, totalRows - 1));
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex(Math.max(activeIndex - 1, 0));
          return;
        }
        // Space is a second Enter only in browse mode, where there is nothing to type into yet.
        if (event.key === "Enter" || (event.key === " " && trimmedQuery === "")) {
          event.preventDefault();
          if (resultRow) {
            activate(resultRow);
          } else if (browseRow?.kind === "link") {
            goToSubscriptions();
          } else if (browseRow?.streamKey !== undefined) {
            goToKey(browseRow.streamKey);
          } else if (browseRow?.expandId !== undefined) {
            toggleExpanded(browseRow.expandId);
          }
          return;
        }
        if (!browseRow) return;
        if (event.key === "ArrowRight") {
          if (browseRow.expandId === undefined) return;
          if (!expandedIds.has(browseRow.expandId)) {
            event.preventDefault();
            toggleExpanded(browseRow.expandId);
          } else if (browseRows[browseIndex + 1]?.parentId === browseRow.expandId) {
            // Already open: step into the group, onto its first feed.
            event.preventDefault();
            setSelectedIndex(activeIndex + 1);
          }
          return;
        }
        if (event.key === "ArrowLeft") {
          if (browseRow.expandId !== undefined) {
            if (expandedIds.has(browseRow.expandId)) {
              event.preventDefault();
              toggleExpanded(browseRow.expandId);
            }
            return;
          }
          if (browseRow.parentId === undefined) return;
          const parentIndex = browseRows.findIndex((row) => row.expandId === browseRow.parentId);
          if (parentIndex === -1) return;
          // Out of a feed: close the group around it and land on the group's own row.
          event.preventDefault();
          toggleExpanded(browseRow.parentId);
          setSelectedIndex(results.length + parentIndex);
        }
      },
    }));

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
  },
);
NavigatorPanel.displayName = "NavigatorPanel";
