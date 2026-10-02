import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { isReadStreamId } from "shared/feedsApi/streams";
import type { Entry } from "shared/feedsApi/types";
import { flattenStream, useMarkRead, useRefreshEntries } from "client/api/queries";
import type { useStream } from "client/api/queries";
import { MosaicTile } from "client/components/articles/MosaicTile";
import type { TileSlot } from "client/components/articles/MosaicTile";
import { UNDO_STRIP_HEIGHT, UndoStrip } from "client/components/articles/UndoStrip";
import type { StripAction } from "client/components/articles/UndoStrip";
import { PullIndicator } from "client/components/articles/PullIndicator";
import { Icon } from "client/components/ui/icons";
import { layoutMasonry, neighbourOf, tileAspect } from "client/utils/masonry";
import type { Direction, MasonryLayout } from "client/utils/masonry";
import { useElementWidth } from "client/hooks/useElementWidth";
import { usePullToRefresh } from "client/hooks/usePullToRefresh";
import { useRefreshShortcut } from "client/hooks/useRefreshShortcut";
import { useTier } from "client/hooks/useTier";
import { MosaicFreshness } from "./MosaicFreshness";
import { MosaicSentinel } from "./MosaicSentinel";
import { MosaicSkeleton } from "./MosaicSkeleton";
import { actionClassName } from "./shared";

// Matches the leave transition of the tile and of the undo strip.
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
  streamId: string;
  unreadOnly: boolean;
  result: StreamResult;
  // The key the result runs under, so a refresh can trim and refetch that cache and no other.
  queryKey: readonly unknown[];
  readerOpen: boolean;
  searchQuery?: string;
}

export const MosaicBody = ({
  streamId,
  unreadOnly,
  result,
  queryKey,
  readerOpen,
  searchQuery,
}: MosaicBodyProps) => {
  const entries = flattenStream(result.data);
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = result;
  const refreshEntries = useRefreshEntries();
  // A refresh shows the newest, so the pane goes back to the top first: the cache is about to
  // shrink to one page anyway, which would otherwise drop the reader somewhere in the middle.
  const refreshAsync = async () => {
    frame?.closest(".scroll-pane")?.scrollTo({ top: 0 });
    await refreshEntries(queryKey);
  };
  const refresh = (): void => {
    void refreshAsync();
  };
  // The next page loading is not a refresh; only the first page fetching again is.
  const refreshing = result.isFetching && !isFetchingNextPage;
  useRefreshShortcut({ enabled: !readerOpen, onRefresh: refresh });
  // Pulling up past the end refreshes only once every page is in, or it would race the sentinel.
  const { attach: attachPull, pull } = usePullToRefresh({
    onRefresh: refreshAsync,
    pullUp: !hasNextPage,
  });
  // State, not a ref: the sentinel moves between the empty state and the grid, and the observer
  // has to follow it.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const { attach, element: frame, width } = useElementWidth();
  const markRead = useMarkRead();
  // A card marked read in an unread-only view goes through three states: `pending`, where the undo
  // strip holds its place at the strip's own height; `leaving`, fading out in the slot it had,
  // since the layout no longer places it; then `gone`, out of the layout for good.
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [leaving, setLeaving] = useState<ReadonlyMap<string, TileSlot>>(() => new Map());
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  // Undone entries, held until the optimistic flip back to unread lands, or the pass below would
  // see a still-read entry and open a second strip for it.
  const [undone, setUndone] = useState<ReadonlySet<string>>(() => new Set());
  // Entries this grid has shown unread. Only these can turn read under its eyes: one already read
  // when it arrived (confirmed before a remount, or read in another view) stays out, with no strip.
  const [seenUnread, setSeenUnread] = useState<ReadonlySet<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string>();
  // The strip whose card had focus when it turned read: its Undo takes focus on mount.
  const [focusStripId, setFocusStripId] = useState<string>();
  // An undone card to focus once it is back in the grid, a render after the strip left. A ref,
  // since the card's own `onFocus` sets `activeId`.
  const refocusId = useRef<string>(undefined);
  // Whether the list is on screen: at `lg` it always is, below that the reader replaces it.
  const tier = useTier();
  const listCovered = readerOpen && tier !== "desktop";
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
    if (!sentinel) return undefined;
    const observer = new IntersectionObserver((observed) => {
      if (observed[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [sentinel, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Every cached entry can be hidden as already read while later pages still hold unread ones. The
  // sentinel would sit below the skeleton, out of view, so this pages them in directly, one fetch
  // per page landed. A failed fetch stops here: the error view or a refresh takes over.
  const allHidden =
    result.isSuccess &&
    entries.every(
      (entry) => gone.has(entry.id) || (unreadOnly && !entry.unread && !seenUnread.has(entry.id)),
    );
  useEffect(() => {
    if (allHidden && hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [allHidden, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  useEffect(() => {
    const id = refocusId.current;
    if (id === undefined) return;
    const link = frame
      ?.querySelector(`[data-entry-id="${CSS.escape(id)}"]`)
      ?.querySelector<HTMLElement>("a");
    if (!link) return;
    refocusId.current = undefined;
    link.focus();
  });

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

  if (result.isPending) {
    return (
      <MosaicSkeleton
        label={searchQuery === undefined ? "Loading articles" : `Searching for “${searchQuery}”`}
      />
    );
  }
  if (result.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm text-danger">
        <p>{result.error.message}</p>
        <button type="button" className={actionClassName} onClick={() => void result.refetch()}>
          Retry
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

  // The rows ride the pull along with the disc, native style; the frame stays put, so the disc
  // sits in the gap the rows leave. Typed as an intersection, since React's CSSProperties has no
  // index for `--*` keys.
  const pullStyle: CSSProperties & { "--pull": string } = { "--pull": `${pull?.distance ?? 0}px` };

  if (shown.length === 0 && hasNextPage) {
    return (
      <div>
        <MosaicFreshness
          updatedAt={result.dataUpdatedAt}
          refreshing={refreshing}
          onRefresh={refresh}
          searchQuery={searchQuery}
          count={placed.length}
        />
        <MosaicSkeleton label="Loading more articles" />
      </div>
    );
  }

  if (shown.length === 0) {
    return (
      <div ref={attachPull} className="relative">
        <PullIndicator pull={pull} />
        <div
          className="pull-content"
          data-edge={pull?.edge}
          data-released={pull?.released || undefined}
          data-refreshing={pull?.refreshing || undefined}
          style={pullStyle}
        >
          <MosaicFreshness
            updatedAt={result.dataUpdatedAt}
            refreshing={refreshing}
            onRefresh={refresh}
            searchQuery={searchQuery}
            count={placed.length}
          />
          <div className="flex flex-col items-center gap-4 px-4 pt-12 pb-8 text-center text-sm text-faint">
            <p>
              {searchQuery === undefined
                ? "Nothing to read here."
                : `No articles match “${searchQuery}”.`}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {searchQuery === undefined ? null : (
                <Link
                  to="."
                  search={(prev) => ({ ...prev, q: undefined })}
                  className={actionClassName}
                >
                  Clear search
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
                Show all articles
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const layout: MasonryLayout | undefined =
    width === undefined
      ? undefined
      : layoutMasonry({
          containerWidth: width,
          items: placed.map((entry) => ({
            id: entry.id,
            aspect: tileAspect(entry),
            height: pending.has(entry.id) ? UNDO_STRIP_HEIGHT : undefined,
          })),
        });

  // A card turned read behind the grid's back (the reader's exits, the scrim, Escape, a direct
  // open) gets the same undo strip as one toggled here: the optimistic cache flip is the signal.
  // The grid stays mounted under the reader on every tier, so `shown` only holds entries seen
  // unread here. Set during render, guarded, so it settles in one extra pass.
  if (layout && unreadOnly && !holdLeave) {
    const settled = [...undone].filter(
      (id) => !placed.some((entry) => entry.id === id && !entry.unread),
    );
    if (settled.length > 0) {
      setUndone((prev) => {
        const next = new Set(prev);
        for (const id of settled) next.delete(id);
        return next;
      });
    }
    // A failed request rolls the entry back to unread: whatever state it was in, it is a card again.
    const revived = entries.filter(
      (entry) =>
        entry.unread &&
        !undone.has(entry.id) &&
        (pending.has(entry.id) || leaving.has(entry.id) || gone.has(entry.id)),
    );
    if (revived.length > 0) {
      const ids = new Set(revived.map((entry) => entry.id));
      setPending((prev) => new Set([...prev].filter((id) => !ids.has(id))));
      setLeaving((prev) => new Map([...prev].filter(([id]) => !ids.has(id))));
      setGone((prev) => new Set([...prev].filter((id) => !ids.has(id))));
    }
    const turned = placed.filter(
      (entry) => !entry.unread && !pending.has(entry.id) && !undone.has(entry.id),
    );
    if (turned.length > 0) {
      setPending((prev) => new Set([...prev, ...turned.map((entry) => entry.id)]));
    }
  }

  // A strip holds a slot in the layout but is no card, so the arrows and Home/End step over it.
  const navigable = placed.filter((entry) => !pending.has(entry.id));

  // Roving tabindex: one card is tabbable, the first until the user focuses another.
  const tabbableId = navigable.some((entry) => entry.id === activeId)
    ? activeId
    : navigable.at(0)?.id;

  const cardElement = (id: string): HTMLElement | null =>
    frame?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"]`) ?? null;

  const focusTile = (id: string): void => {
    setActiveId(id);
    cardElement(id)?.querySelector("a")?.focus();
  };

  // Keeps going the way it was asked until a card turns up: a run of strips is one hop, not a
  // dead end on a slot with nothing to focus.
  const cardNeighbour = ({ id, direction }: { id: string; direction: Direction }) => {
    if (!layout) return undefined;
    let target = neighbourOf({ layout, id, direction });
    while (target !== undefined && pending.has(target)) {
      target = neighbourOf({ layout, id: target, direction });
    }
    return target;
  };

  const handleTileKeyDown = (id: string) => (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (!layout) return;
    const direction = ARROWS[event.key];
    let target: string | undefined;
    if (direction !== undefined) target = cardNeighbour({ id, direction });
    else if (event.key === "Home") target = navigable.at(0)?.id;
    else if (event.key === "End") target = navigable.at(-1)?.id;
    else return;
    event.preventDefault();
    if (target !== undefined) focusTile(target);
  };

  // The card to take focus from one that leaves: below, above, then the next and previous in
  // order. Works whether the entry is a card still or already a strip.
  const leavingNeighbour = (id: string): string | undefined => {
    const index = placed.findIndex((candidate) => candidate.id === id);
    const isCard = (candidate: Entry) => !pending.has(candidate.id) && candidate.id !== id;
    return (
      cardNeighbour({ id, direction: "down" }) ??
      cardNeighbour({ id, direction: "up" }) ??
      placed.slice(index + 1).find(isCard)?.id ??
      placed.slice(0, Math.max(index, 0)).reverse().find(isCard)?.id
    );
  };

  const toggleRead = (entry: Entry): void => {
    markRead.mutate({ entryIds: [entry.id], read: entry.unread });
    // In an unread-only view a read card hands its slot to the undo strip.
    if (!entry.unread || !unreadOnly) return;
    // Focus was on that card (M key, or a click on its button): the strip's Undo takes it, so the
    // one key that reverses the mistake is Enter.
    setFocusStripId(cardElement(entry.id)?.contains(document.activeElement) ? entry.id : undefined);
  };

  // Confirm on the strip, or its countdown running out: the entry stays read and the slot closes,
  // through the same fade a card gets.
  const confirmRead = ({ entryId, hadFocus }: { entryId: string } & StripAction): void => {
    setFocusStripId(undefined);
    if (hadFocus) {
      const next = leavingNeighbour(entryId);
      if (next !== undefined) focusTile(next);
    }
    const slot = layout?.positions.get(entryId);
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
    if (slot) setLeaving((prev) => new Map(prev).set(entryId, slot));
    else setGone((prev) => new Set(prev).add(entryId));
  };

  const undoRead = ({ entryId, hadFocus }: { entryId: string } & StripAction): void => {
    setFocusStripId(undefined);
    if (hadFocus) refocusId.current = entryId;
    markRead.mutate({ entryIds: [entryId], read: false });
    setUndone((prev) => new Set(prev).add(entryId));
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
  };

  return (
    <div ref={attachPull} className="relative">
      <PullIndicator pull={pull} />
      <div
        className="pull-content"
        data-edge={pull?.edge}
        data-released={pull?.released || undefined}
        data-refreshing={pull?.refreshing || undefined}
        style={pullStyle}
      >
        <MosaicFreshness
          updatedAt={result.dataUpdatedAt}
          refreshing={refreshing}
          onRefresh={refresh}
          searchQuery={searchQuery}
          count={placed.length}
        />
        <div className="p-3">
          {/* Columns follow the frame's own width, so an open reader panel narrows the mosaic. */}
          <div ref={attach} className="relative" style={{ height: layout?.height ?? 0 }}>
            {layout === undefined
              ? null
              : shown.map((entry) => {
                  const slot = layout.positions.get(entry.id) ?? leaving.get(entry.id);
                  if (!slot) return null;
                  // Read, and still recoverable: the strip holds the slot for the countdown, and
                  // fades out of it once kept.
                  if (pending.has(entry.id) || leaving.has(entry.id)) {
                    return (
                      <UndoStrip
                        key={entry.id}
                        slot={slot}
                        leaving={leaving.has(entry.id)}
                        autoFocus={entry.id === focusStripId}
                        onUndo={({ hadFocus }) => {
                          undoRead({ entryId: entry.id, hadFocus });
                        }}
                        onConfirm={({ hadFocus }) => {
                          confirmRead({ entryId: entry.id, hadFocus });
                        }}
                      />
                    );
                  }
                  return (
                    <MosaicTile
                      key={entry.id}
                      streamId={streamId}
                      entry={entry}
                      muteRead={!isReadStreamId(streamId)}
                      slot={slot}
                      tabIndex={entry.id === tabbableId ? 0 : -1}
                      onFocus={() => {
                        setActiveId(entry.id);
                      }}
                      onKeyDown={handleTileKeyDown(entry.id)}
                      onToggleRead={() => {
                        toggleRead(entry);
                      }}
                      swipeable={layout.columns === 1}
                      leavesWhenRead={unreadOnly}
                    />
                  );
                })}
          </div>
          <MosaicSentinel sentinelRef={setSentinel} />
        </div>
      </div>
    </div>
  );
};
