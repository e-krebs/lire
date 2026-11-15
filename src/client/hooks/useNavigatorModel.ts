import { useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { parseStreamKey, toStreamKey } from "shared/feedsApi/streamKey";
import type { Category, Feed } from "shared/feedsApi/types";
import { useFeeds, useOrderedCategories } from "client/api/queries";
import {
  NO_ROW,
  SUBSCRIPTIONS_ROW_KEY,
  categoryRowKey,
  feedRowKey,
} from "client/components/browse-menu/rows/shared";

export type ResultRow =
  | { kind: "search" }
  | { kind: "category"; category: Category }
  | { kind: "feed"; feed: Feed };

export const categoryStreamKey = (categoryId: string) =>
  toStreamKey({ kind: "folder", label: categoryId });
export const feedStreamKey = (feedId: string) => toStreamKey({ kind: "feed", feedId });

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

interface UseNavigatorModelProps {
  open: boolean;
  /** Text typed in the location bar field. */
  query: string;
  onQueryChange: (value: string) => void;
  /** Panel should close, e.g. after a selection. */
  onClose: () => void;
  /** Route key of the stream a search is limited to: "all", `folder:<label>` or `feed:<id>`. */
  scopeKey: string;
}

// Browsing starts with no row highlighted: a highlight there reads as "selected" on a touch
// screen, where no arrow key will ever move it. A typed query highlights its top row, so
// Enter has a target.
const initialIndex = (value: string): number => (value.trim() === "" ? NO_ROW : 0);

export const useNavigatorModel = ({
  open,
  query,
  onQueryChange,
  onClose,
  scopeKey,
}: UseNavigatorModelProps) => {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const { categories: categoryList, ready: categoriesReady } = useOrderedCategories();
  const feedsQuery = useFeeds();

  const currentStream = params.streamKey === undefined ? null : parseStreamKey(params.streamKey);
  // The group the current stream lives in: the category itself, or a feed's first category.
  const currentGroupId = ((): string | undefined => {
    if (currentStream?.kind === "folder") return currentStream.label;
    if (currentStream?.kind !== "feed") return undefined;
    return feedsQuery.data?.find((item) => item.id === currentStream.feedId)?.categoryIds[0];
  })();
  // Groups start collapsed; only the group holding the current stream opens on its own.
  const initialExpanded = (): Set<string> =>
    new Set(currentGroupId === undefined ? [] : [currentGroupId]);

  const [selectedIndex, setSelectedIndex] = useState(() => initialIndex(query));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(initialExpanded);

  // Re-selecting the first result on every keystroke belongs to the `query` transition itself,
  // not to an Effect reacting to it afterwards — the react.dev "adjusting state when a prop
  // changes" pattern.
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setSelectedIndex(initialIndex(query));
  }

  // The panel used to unmount on close, so nothing survived a close; reset on the way open to
  // match. Runs after the `query` reset so a reopen with a changed query lands on the same index.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setSelectedIndex(initialIndex(query));
      setExpandedIds(initialExpanded());
    }
  }

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

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // The bar calls this on every key; while closed there is no panel to drive.
    if (!open) return;
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
  };

  return {
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
    handleKeyDown,
    close: onClose,
  };
};

export type NavigatorModel = ReturnType<typeof useNavigatorModel>;
