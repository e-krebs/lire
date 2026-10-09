import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentProps, CSSProperties, KeyboardEvent, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { StreamKey } from "shared/feedsApi/streamKey";
import type { Entry } from "shared/feedsApi/types";
import { flattenStream, useMark, useRefreshAllLists, useRefreshEntries } from "client/api/queries";
import type { useStream } from "client/api/queries";
import { MosaicTile } from "client/components/articles/MosaicTile";
import type { TileSlot } from "client/components/articles/MosaicTile";
import { PullIndicator } from "client/components/articles/PullIndicator";
import { Icon } from "client/components/ui/icons";
import { useT } from "client/i18n/useT";
import { layoutMasonry, neighbourOf, tileAspect } from "client/utils/masonry";
import type { Direction, MasonryLayout } from "client/utils/masonry";
import { textCardHeight } from "client/utils/textHeight";
import { useElementWidth } from "client/hooks/useElementWidth";
import { usePullToRefresh } from "client/hooks/usePullToRefresh";
import type { PullState } from "client/hooks/usePullToRefresh";
import { useRefreshOnForeground } from "client/hooks/useRefreshOnForeground";
import { useRefreshShortcut } from "client/hooks/useRefreshShortcut";
import { useTier } from "client/hooks/useTier";
import { MosaicEmptyArt } from "./MosaicEmptyArt";
import { MosaicFreshness } from "./MosaicFreshness";
import { MosaicSentinel } from "./MosaicSentinel";
import { MosaicSkeleton } from "./MosaicSkeleton";
import { actionClassName } from "./shared";

// Matches the leave transition of the tile.
const LEAVE_MS = 200;
// Below `lg` the list is hidden while the reader is open, and the reader closes through a view
// transition: a card turned read in there waits this long after the close before it leaves, so
// the leave plays on a list the eye can see.
const READER_SETTLE_MS = 300;

const ARROWS: Partial<Record<string, Direction>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

// Both branches below run the same infinite query shape, so the body renders either one.
type StreamResult = ReturnType<typeof useStream>;

interface MosaicBodyProps {
  streamKey: StreamKey;
  unreadOnly: boolean;
  result: StreamResult;
  // The key the result runs under, so a refresh can trim and refetch that cache and no other.
  queryKey: readonly unknown[];
  readerOpen: boolean;
  searchQuery?: string;
}

export const MosaicBody = ({
  streamKey,
  unreadOnly,
  result,
  queryKey,
  readerOpen,
  searchQuery,
}: MosaicBodyProps) => {
  const t = useT();
  const entries = flattenStream(result.data);
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = result;
  const refreshEntries = useRefreshEntries();
  // Any element inside the pane, for the scroll to the top; the grid's frame is gone in the
  // skeleton and the empty state.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [refreshingList, setRefreshingList] = useState(false);
  // A second refresh joins the running one, or its end would bring the grid back early.
  const running = useRef<Promise<void>>(undefined);
  // A refresh shows the newest, so the pane goes back to the top first: the cache is about to
  // shrink to one page anyway, which would otherwise drop the reader somewhere in the middle.
  const refreshAsync = async (): Promise<void> => {
    running.current ??= (async () => {
      host?.closest(".scroll-pane")?.scrollTo({ top: 0 });
      setRefreshingList(true);
      try {
        await refreshEntries({ queryKey });
      } finally {
        setRefreshingList(false);
        running.current = undefined;
      }
    })();
    return running.current;
  };
  const refresh = (): void => {
    void refreshAsync();
  };
  // The next page loading is not a refresh; only the first page fetching again is.
  const refreshing = result.isFetching && !isFetchingNextPage;
  useRefreshShortcut({ enabled: !readerOpen, onRefresh: refresh });
  // Whether the list is on screen: at `lg` it always is, below that the reader replaces it.
  const tier = useTier();
  const listCovered = readerOpen && tier !== "desktop";
  const refreshAllLists = useRefreshAllLists();
  // Under the reader a trim and a scroll to the top would move the list behind it, so it only
  // refetches, pages and position kept.
  useRefreshOnForeground({
    onForeground: async () =>
      refreshAllLists({
        queryKey,
        refreshList: listCovered
          ? async () => refreshEntries({ queryKey, trim: false })
          : refreshAsync,
      }),
  });
  // Pulling up past the end refreshes only once every page is in and settled, or it would race
  // the sentinel.
  const { attach: attachPull, pull } = usePullToRefresh({
    onRefresh: refreshAsync,
    pullUp: !hasNextPage && !result.isFetching && !isFetchNextPageError,
  });
  const attachPullHost = useCallback(
    (element: HTMLElement | null) => {
      attachPull(element);
      setHost(element);
    },
    [attachPull],
  );
  // State, not a ref: the sentinel moves between the empty state and the grid, and the observer
  // has to follow it.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const { attach, element: frame, width } = useElementWidth();
  const mark = useMark();
  // A card marked read in an unread-only view goes through two states: `leaving`, fading out in
  // the slot it had, since the layout no longer places it; then `gone`, out of the layout for good.
  const [leaving, setLeaving] = useState<ReadonlyMap<string, TileSlot>>(() => new Map());
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  // Entries this grid has shown unread. Only these can turn read under its eyes: one already read
  // when it arrived (closed before a remount, or read in another view) stays out.
  const [seenUnread, setSeenUnread] = useState<ReadonlySet<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string>();
  // Image URLs that failed to load: their cards render as text, so the layout sizes them as text.
  const [brokenImages, setBrokenImages] = useState<ReadonlySet<string>>(() => new Set());
  const markImageBroken = useCallback((url: string) => {
    setBrokenImages((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
  }, []);
  // The card to focus once the render that closed the focused one has committed.
  const [handoffId, setHandoffId] = useState<string>();
  const [settling, setSettling] = useState(false);
  const [wasCovered, setWasCovered] = useState(listCovered);
  if (listCovered !== wasCovered) {
    setWasCovered(listCovered);
    if (!listCovered) setSettling(true);
  }
  // The pass that notices the uncovering still runs with the old `settling`, so it holds too.
  const holdLeave = listCovered || settling || listCovered !== wasCovered;
  useEffect(() => {
    if (!settling) return undefined;
    const timer = window.setTimeout(() => {
      setSettling(false);
    }, READER_SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [settling]);

  // The sentinel's visibility is a signal from the browser, not derived state — an
  // IntersectionObserver Effect is the "synchronizing with an external system" carve-out.
  useEffect(() => {
    // A trimmed cache still has a next page, and fetching it would cancel the refresh.
    if (!sentinel || refreshingList) return undefined;
    const observer = new IntersectionObserver((observed) => {
      if (observed[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [sentinel, refreshingList, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Every cached entry can be hidden as already read while later pages still hold unread ones. The
  // sentinel would sit below the skeleton, out of view, so this pages them in directly, one fetch
  // per page landed. A failed fetch stops here: the error view or a refresh takes over.
  const allHidden =
    result.isSuccess &&
    entries.every(
      (entry) => gone.has(entry.id) || (unreadOnly && !entry.unread && !seenUnread.has(entry.id)),
    );
  useEffect(() => {
    if (
      allHidden &&
      !refreshingList &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchNextPageError
    ) {
      void fetchNextPage();
    }
  }, [
    allHidden,
    refreshingList,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  ]);

  useEffect(() => {
    if (handoffId === undefined) return;
    frame
      ?.querySelector(`[data-entry-id="${CSS.escape(handoffId)}"]`)
      ?.querySelector<HTMLElement>("a")
      ?.focus();
    // oxlint-disable-next-line react/set-state-in-effect -- consume the one-shot hand-off
    setHandoffId(undefined);
  }, [frame, handoffId]);

  useEffect(() => {
    if (leaving.size === 0) return undefined;
    const timer = window.setTimeout(() => {
      setGone((prev) => new Set([...prev, ...leaving.keys()]));
      setLeaving(new Map());
    }, LEAVE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [leaving]);

  const loadingLabel =
    searchQuery === undefined
      ? t.articles.loadingArticles
      : t.articles.searchingFor({ query: searchQuery });
  if (result.isPending) return <MosaicSkeleton label={loadingLabel} wholeList />;
  if (result.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm text-danger">
        <p>{result.error.message}</p>
        <button type="button" className={actionClassName} onClick={() => void result.refetch()}>
          {t.common.retry}
        </button>
      </div>
    );
  }

  const newlyUnread = entries.filter((entry) => entry.unread && !seenUnread.has(entry.id));
  if (newlyUnread.length > 0) {
    setSeenUnread((prev) => new Set([...prev, ...newlyUnread.map((entry) => entry.id)]));
  }
  const shown = entries.filter(
    (entry) => !gone.has(entry.id) && (!unreadOnly || entry.unread || seenUnread.has(entry.id)),
  );
  const placed = shown.filter((entry) => !leaving.has(entry.id));

  // A bottom pull's disc would sit below the skeleton, out of reach once the pane stops
  // scrolling, so it parks at the top for the rest of the refresh.
  const shownPull =
    pull?.edge === "bottom" && (refreshingList || pull.refreshing)
      ? { ...pull, edge: "top" as const }
      : pull;
  const freshness: ComponentProps<typeof MosaicFreshness> = {
    updatedAt: result.dataUpdatedAt,
    refreshing,
    onRefresh: refresh,
    searchQuery,
    count: placed.length,
  };

  if (refreshingList) {
    return (
      <PullFrame
        attach={attachPullHost}
        pull={shownPull}
        freshness={freshness}
        className="relative min-h-full"
      >
        <MosaicSkeleton label={loadingLabel} wholeList />
      </PullFrame>
    );
  }

  if (shown.length === 0 && hasNextPage) {
    return (
      <div ref={setHost}>
        <MosaicFreshness {...freshness} />
        <MosaicSkeleton label={t.articles.loadingMoreArticles} wholeList />
      </div>
    );
  }

  if (shown.length === 0) {
    // `min-h-full` so a short empty view still leaves a finger room to pull from the bottom.
    return (
      <PullFrame
        attach={attachPullHost}
        pull={shownPull}
        freshness={freshness}
        className="relative min-h-full"
      >
        <div className="flex flex-col items-center gap-4 px-4 pt-12 pb-8 text-center text-sm text-faint">
          <MosaicEmptyArt refreshedAt={result.dataUpdatedAt} />
          <p>
            {searchQuery === undefined
              ? t.articles.nothingToRead
              : t.articles.noArticlesMatch({ query: searchQuery })}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {searchQuery === undefined ? null : (
              <Link
                to="."
                search={(prev) => ({ ...prev, q: undefined })}
                className={actionClassName}
              >
                {t.articles.clearSearch}
              </Link>
            )}
            {/* Everything there is: the all-articles stream, read entries included, no search. */}
            <Link
              to="/stream/$streamKey"
              params={{ streamKey: "all" }}
              search={(prev) => ({ ...prev, unread: false, q: undefined })}
              className={actionClassName}
            >
              <Icon name="everything" className="size-4" />
              {t.articles.showAllArticles}
            </Link>
          </div>
        </div>
      </PullFrame>
    );
  }

  const layout: MasonryLayout | undefined =
    width === undefined
      ? undefined
      : layoutMasonry({
          containerWidth: width,
          items: placed.map((entry) =>
            entry.imageUrl && !brokenImages.has(entry.imageUrl)
              ? { id: entry.id, aspect: tileAspect(entry) }
              : {
                  id: entry.id,
                  heightAt: (columnWidth: number) =>
                    textCardHeight({
                      title: entry.title,
                      untitled: t.articles.untitled,
                      width: columnWidth,
                    }),
                },
          ),
        });

  // Roving tabindex: one card is tabbable, the first until the user focuses another.
  const tabbableId = placed.some((entry) => entry.id === activeId) ? activeId : placed.at(0)?.id;

  const cardElement = (id: string): HTMLElement | null =>
    frame?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"]`) ?? null;

  const focusTile = (id: string): void => {
    setActiveId(id);
    cardElement(id)?.querySelector("a")?.focus();
  };

  const handleTileKeyDown = (id: string) => (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (!layout) return;
    const direction = ARROWS[event.key];
    let target: string | undefined;
    if (direction !== undefined) target = neighbourOf({ layout, id, direction });
    else if (event.key === "Home") target = placed.at(0)?.id;
    else if (event.key === "End") target = placed.at(-1)?.id;
    else return;
    event.preventDefault();
    if (target !== undefined) focusTile(target);
  };

  // The card to take focus from one that leaves: below, above, then the next and previous in order.
  const leavingNeighbour = (id: string): string | undefined => {
    if (!layout) return undefined;
    const index = placed.findIndex((candidate) => candidate.id === id);
    const candidates: Array<string | undefined> = [
      neighbourOf({ layout, id, direction: "down" }),
      neighbourOf({ layout, id, direction: "up" }),
      placed[index + 1]?.id,
      placed.slice(0, Math.max(index, 0)).at(-1)?.id,
    ];
    return candidates.find((candidate) => candidate !== undefined);
  };

  const cardHasFocus = (id: string): boolean =>
    cardElement(id)?.contains(document.activeElement) ?? false;

  // A card turned read behind the grid's back (the reader's exits, the scrim, Escape, a direct
  // open) leaves like one toggled here: the optimistic cache flip is the signal. The grid stays
  // mounted under the reader on every tier, so `shown` only holds entries seen unread here. Set
  // during render, guarded, so it settles in one extra pass.
  if (layout && unreadOnly && !holdLeave) {
    // A failed request rolls the entry back to unread: whatever state it was in, it is a card again.
    const revived = entries.filter(
      (entry) => entry.unread && (leaving.has(entry.id) || gone.has(entry.id)),
    );
    if (revived.length > 0) {
      const ids = new Set(revived.map((entry) => entry.id));
      setLeaving((prev) => new Map([...prev].filter(([id]) => !ids.has(id))));
      setGone((prev) => new Set([...prev].filter((id) => !ids.has(id))));
    }
    const turned = placed.filter((entry) => !entry.unread);
    if (turned.length > 0) {
      for (const entry of turned) {
        const next = cardHasFocus(entry.id) ? leavingNeighbour(entry.id) : undefined;
        if (next !== undefined) setHandoffId(next);
      }
      setLeaving((prev) => {
        const next = new Map(prev);
        for (const entry of turned) {
          const slot = layout.positions.get(entry.id);
          if (slot) next.set(entry.id, slot);
        }
        return next;
      });
      const unplaced = turned.filter((entry) => !layout.positions.has(entry.id));
      if (unplaced.length > 0) {
        setGone((prev) => new Set([...prev, ...unplaced.map((entry) => entry.id)]));
      }
    }
  }

  const toggleRead = (entry: Entry): void => {
    mark.mutate({ entryIds: [entry.id], read: entry.unread });
    if (!entry.unread || !unreadOnly || !cardHasFocus(entry.id)) return;
    const next = leavingNeighbour(entry.id);
    if (next !== undefined) focusTile(next);
  };

  return (
    <PullFrame attach={attachPullHost} pull={shownPull} freshness={freshness} className="relative">
      <div className="p-3">
        {/* Columns follow the frame's own width, so an open reader panel narrows the mosaic. */}
        <div
          ref={attach}
          data-eased={gone.size > 0 ? "" : undefined}
          className="relative motion-safe:data-eased:transition-[height] motion-safe:data-eased:duration-350 motion-safe:data-eased:ease-[cubic-bezier(0.2,0.7,0.3,1)]"
          style={{ height: layout?.height ?? 0 }}
        >
          {layout === undefined
            ? null
            : shown.map((entry) => {
                const slot = layout.positions.get(entry.id) ?? leaving.get(entry.id);
                if (!slot) return null;
                return (
                  <MosaicTile
                    key={entry.id}
                    streamKey={streamKey}
                    entry={entry}
                    muteRead={streamKey !== "read"}
                    slot={slot}
                    tabIndex={entry.id === tabbableId ? 0 : -1}
                    onFocus={() => {
                      setActiveId(entry.id);
                    }}
                    onKeyDown={handleTileKeyDown(entry.id)}
                    onToggleRead={() => {
                      toggleRead(entry);
                    }}
                    onImageBroken={markImageBroken}
                    swipeable={layout.columns === 1}
                    leavesWhenRead={unreadOnly}
                    leaving={leaving.has(entry.id)}
                  />
                );
              })}
        </div>
        <MosaicSentinel sentinelRef={setSentinel} />
      </div>
      {isFetchingNextPage && shown.length > 0 && layout ? (
        <MosaicSkeleton label={t.articles.loadingMoreArticles} count={layout.columns} />
      ) : null}
    </PullFrame>
  );
};

interface PullFrameProps {
  attach: (element: HTMLElement | null) => void;
  pull: PullState | null;
  freshness: ComponentProps<typeof MosaicFreshness>;
  className: string;
  children: ReactNode;
}

// One component type in every branch, so the wrapper node survives a swap and the pull keeps its
// element and listeners.
const PullFrame = ({ attach, pull, freshness, className, children }: PullFrameProps) => {
  // The rows ride the pull along with the disc, native style; the frame stays put, so the disc
  // sits in the gap the rows leave. Typed as an intersection, since React's CSSProperties has no
  // index for `--*` keys.
  const pullStyle: CSSProperties & { "--pull": string } = { "--pull": `${pull?.distance ?? 0}px` };
  return (
    <div ref={attach} className={className}>
      <PullIndicator pull={pull} />
      <div
        className="pull-content"
        data-edge={pull?.edge}
        data-released={pull?.released || undefined}
        data-refreshing={pull?.refreshing || undefined}
        style={pullStyle}
      >
        <MosaicFreshness {...freshness} />
        {children}
      </div>
    </div>
  );
};
