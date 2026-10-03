import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import type { StreamKey } from "shared/feedsApi/streamKey";
import type { Entry } from "shared/feedsApi/types";
import { useDirectOpen } from "client/hooks/useDirectOpen";
import { useOriginTitle } from "client/hooks/useOriginTitle";
import { useImageFallback } from "client/hooks/useImageFallback";
import { feedHue } from "client/utils/feedHue";
import { decodeEntities } from "client/utils/html";
import { Icon } from "client/components/ui/icons";
import { absoluteTime, shortRelativeTime } from "client/utils/time";
import { useLocale } from "client/i18n/locale";
import { useT } from "client/i18n/useT";
import { tip } from "client/utils/tooltip";

export interface TileSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MosaicTileProps {
  /** The stream the tile was listed in; the link carries its route key. */
  streamKey: StreamKey;
  entry: Entry;
  /** Off in the recently-read stream, where every tile is read and dimming would say nothing. */
  muteRead?: boolean;
  /** The grid owns the layout: the card only places itself where it was told to. */
  slot: TileSlot;
  /** Roving tabindex: only the grid's active card is tabbable. */
  tabIndex: 0 | -1;
  /** Card takes focus, so the grid tracks the active card. */
  onFocus: () => void;
  /** Key pressed on the card, for the grid's keyboard navigation. */
  onKeyDown: (event: KeyboardEvent<HTMLAnchorElement>) => void;
  /** Read state toggled from the card. */
  onToggleRead: () => void;
  /** Single-column layout only: swiping a card either way toggles it read. */
  swipeable?: boolean;
  /** In an unread-only view a card swiped read leaves the grid, so it flies out first. */
  leavesWhenRead?: boolean;
  /** Read and out of the layout: the card fades out of the slot it had, then the grid drops it. */
  leaving?: boolean;
}

// Past this the pointer is swiping, not tapping; past 40% of the card it commits.
const DRAG_SLOP = 8;
const COMMIT_RATIO = 0.4;
// The fly-out, then the grid closes the gap: matches the mover's transition below.
const FLY_MS = 200;
// A card flying out clears the slot by this much, so its shadow leaves too.
const FLY_MARGIN = 24;

// A named group: `Panes` is a `group` too, and a bare `group-hover/tile:` would light every card up.
// The lift lives here rather than on the card link, because the visible card is the link's sibling.
const wrapperClassName = `
  group/tile absolute top-0 left-0 touch-pan-y
  hover:scale-[1.01] has-[a:focus-visible]:scale-[1.01]
  motion-safe:transition-[translate,opacity,scale] motion-safe:duration-200
`;

// The card's visuals and links, which slide as one under the finger; the wrapper keeps the slot.
const moverClassName = `
  absolute inset-0
  motion-safe:transition-[translate,opacity] motion-safe:duration-200 motion-safe:ease-out
`;

// The action uncovered by the swipe, painted in the slot under the mover. `--reveal` (styles.css)
// is the finger's progress to the threshold: it tints the panel and fades the indicator in, and
// `data-armed` on the wrapper says the release will commit. `data-side` is the edge being revealed.
const actionClassName = `
  tile-action absolute inset-0 rounded-xl text-sm font-semibold
`;
const indicatorClassName = `
  tile-action-indicator absolute top-1/2 flex -translate-y-1/2 items-center gap-2
  data-[side=left]:left-6 data-[side=right]:right-6
  data-[side=right]:flex-row-reverse
`;

// The whole card, as the hit surface for the route: the visuals are painted by the sibling below
// it, which lets the title be a link of its own without nesting one anchor inside another.
const cardClassName = `
  absolute inset-0 rounded-xl
  focus-visible:outline-2 focus-visible:outline-accent
`;

const chipClassName = `
  absolute top-2 left-2 z-10 inline-flex max-w-[calc(100%-3.25rem)] items-center gap-1.5
  rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-semibold text-ink
  group-data-read/tile:opacity-80
`;

const titleClassName = `
  tile-title pointer-events-auto line-clamp-3 text-xl/tight font-bold tracking-[-0.01em]
  decoration-2 underline-offset-2
  hover:underline
  focus-visible:outline-2 focus-visible:outline-accent
`;

const buttonClassName = `
  absolute top-1.5 right-1.5 z-10 flex size-8 items-center justify-center rounded-full
  bg-surface/90 text-ink opacity-0 shadow-sm
  group-hover/tile:opacity-100 group-focus-within/tile:opacity-100
  focus-visible:outline-2 focus-visible:outline-accent
  motion-safe:transition-opacity
  pointer-coarse:opacity-100
`;

// The masthead names the feed, so the chip carries the age alone.
const Chip = ({ entry }: { entry: Entry }) => {
  const timestamp = entry.published;
  const locale = useLocale();

  return (
    <span className={chipClassName}>
      <time
        dateTime={new Date(timestamp).toISOString()}
        data-tip={absoluteTime({ timestamp, locale })}
        className="pointer-events-auto flex-none tabular-nums"
      >
        {shortRelativeTime({ timestamp, locale })}
      </time>
    </span>
  );
};

interface MastheadProps {
  originTitle: string;
  title: string;
  original: string | undefined;
  directOpen: boolean;
  tabIndex: 0 | -1;
  onFocus: () => void;
  onTitleClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}

const Masthead = ({
  originTitle,
  title,
  original,
  directOpen,
  tabIndex,
  onFocus,
  onTitleClick,
}: MastheadProps) => {
  const t = useT();
  return (
    <>
      <span
        className={`
        tile-label flex items-center gap-1.5
        text-[11px]/[14px] font-bold tracking-[0.08em] uppercase
      `}
      >
        <span
          data-tip={originTitle}
          data-tip-overflow=""
          className="tile-feed pointer-events-auto min-w-0 truncate"
        >
          {originTitle}
        </span>
        {directOpen ? (
          <span
            aria-hidden="true"
            className={`
            inline-flex h-3.5 flex-none items-center rounded-full bg-accent px-1 text-on-accent
          `}
          >
            <Icon name="external" className="size-2.5" />
          </span>
        ) : null}
      </span>
      <span aria-hidden="true" className="tile-rule mt-1.5 mb-2 h-0.5 w-7 flex-none rounded-full" />
      {original === undefined ? (
        <span data-tip={title} data-tip-overflow="" className={titleClassName}>
          {title}
        </span>
      ) : (
        <a
          href={original}
          target="_blank"
          rel="noopener"
          aria-label={t.articles.opensOriginalInNewTab({ title })}
          data-tip={title}
          data-tip-overflow={directOpen ? t.articles.opensOnItsSite : t.articles.openTheOriginal}
          tabIndex={tabIndex}
          onFocus={onFocus}
          onClick={onTitleClick}
          className={titleClassName}
        >
          {title}
        </a>
      )}
    </>
  );
};

export const MosaicTile = ({
  streamKey,
  entry,
  muteRead = true,
  slot,
  tabIndex,
  onFocus,
  onKeyDown,
  onToggleRead,
  swipeable = false,
  leavesWhenRead = false,
  leaving = false,
}: MosaicTileProps) => {
  const image = useImageFallback({ url: entry.imageUrl });
  const t = useT();
  const hasImage = image.src !== undefined;
  const isRead = muteRead && !entry.unread;
  const title = entry.title ? decodeEntities(entry.title) : t.articles.untitled;
  const originTitle = useOriginTitle({ feedId: entry.feedId });
  const original = entry.url;
  // A newsletter has no page of its own, so the flag has nothing to open: the card stays a route.
  const directOpen = useDirectOpen(entry.feedId) && original !== undefined;
  // The custom property feeds every colour in styles.css; typed as an intersection, since
  // React's CSSProperties has no index for `--*` keys.
  const hueStyle: CSSProperties & { "--hue": string } = {
    "--hue": String(feedHue(entry.feedId)),
  };
  const toggleLabel = entry.unread ? t.articles.markAsRead : t.articles.markAsUnread;

  // `dragX` follows the finger while `dragging`; `flying` is the committed card on its way out.
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState(false);
  const drag = useRef({ startX: 0, startY: 0, active: false, dragging: false });
  const flyTimer = useRef<number>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(flyTimer.current);
    },
    [],
  );
  // React registers touch listeners passive, and `touch-action: pan-y` only decides at the first
  // move: a swipe under way still has to cancel the scroll a drifting finger would start.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !swipeable) return undefined;
    const lockScroll = (event: TouchEvent): void => {
      if (drag.current.dragging) event.preventDefault();
    };
    wrapper.addEventListener("touchmove", lockScroll, { passive: false });
    return () => {
      wrapper.removeEventListener("touchmove", lockScroll);
    };
  }, [swipeable]);

  const commitThreshold = slot.width * COMMIT_RATIO;
  const progress = commitThreshold > 0 ? Math.min(1, Math.abs(dragX) / commitThreshold) : 0;
  const armed = Math.abs(dragX) > commitThreshold;
  const side = dragX < 0 ? "right" : "left";
  const revealStyle: CSSProperties & { "--reveal": number } = {
    "--reveal": progress,
    // Under the finger the tint follows without easing; the snap back eases it away.
    transition: dragging ? "none" : undefined,
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!swipeable || flying || event.pointerType !== "touch") return;
    drag.current = { startX: event.clientX, startY: event.clientY, active: true, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state.active) return;
    const dx = event.clientX - state.startX;
    // Mostly vertical past the slop is a scroll or a pull to refresh, never a swipe: the browser
    // cancels the pointer for a scroll, but a pull keeps it alive with its preventDefault.
    if (
      !state.dragging &&
      Math.abs(event.clientY - state.startY) > Math.max(Math.abs(dx), DRAG_SLOP)
    ) {
      state.active = false;
      return;
    }
    if (Math.abs(dx) > DRAG_SLOP) {
      state.dragging = true;
      setDragging(true);
    }
    if (state.dragging) setDragX(dx);
  };

  const release = (dx: number): void => {
    drag.current.active = false;
    setDragging(false);
    if (Math.abs(dx) <= commitThreshold) {
      setDragX(0);
      return;
    }
    // A card that stays (read view, or turning unread) snaps back and flips in place.
    if (!leavesWhenRead || !entry.unread) {
      setDragX(0);
      onToggleRead();
      return;
    }
    // One that leaves keeps going the way it was pushed, and only then tells the grid, so the
    // neighbours close the gap after the card is gone rather than under it.
    setDragX(Math.sign(dx) * (slot.width + FLY_MARGIN));
    setFlying(true);
    flyTimer.current = window.setTimeout(onToggleRead, FLY_MS);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current.active) release(event.clientX - drag.current.startX);
  };

  // The browser took the pointer for a scroll: nothing commits.
  const handlePointerCancel = () => {
    if (drag.current.active) release(0);
  };

  // The click that ends a swipe must not follow the link it landed on.
  const swallowSwipe = (event: MouseEvent<HTMLAnchorElement>): boolean => {
    if (!drag.current.dragging) return false;
    drag.current.dragging = false;
    event.preventDefault();
    return true;
  };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    swallowSwipe(event);
  };

  // The card about to open lends its title and feed name to the reader's view transition, and
  // takes them back on close (styles.css). Set on the DOM before the navigation, since the old
  // state is captured at once; React never touches the attribute, so it outlives the route.
  const handleCardClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (swallowSwipe(event)) return;
    for (const other of document.querySelectorAll<HTMLElement>("[data-opening]")) {
      delete other.dataset.opening;
    }
    if (wrapperRef.current) wrapperRef.current.dataset.opening = "";
  };

  // Leaving for the publisher's site counts as having read the article.
  const handleDirectClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (swallowSwipe(event)) return;
    if (entry.unread) onToggleRead();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    // Shift stays allowed: it is what produces "M".
    if (event.key.toLowerCase() === "m" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      onToggleRead();
      return;
    }
    onKeyDown(event);
  };

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleRead();
  };

  const cardProps = {
    tabIndex,
    onFocus,
    onKeyDown: handleKeyDown,
    className: cardClassName,
  };

  return (
    <div
      ref={wrapperRef}
      data-entry-id={entry.id}
      data-read={isRead || undefined}
      data-has-image={hasImage || undefined}
      data-direct-open={directOpen ? "" : undefined}
      data-armed={armed || undefined}
      style={{
        translate: `${slot.x}px ${slot.y}px`,
        width: slot.width,
        height: slot.height,
      }}
      inert={leaving || undefined}
      className={
        leaving ? `${wrapperClassName} scale-95 opacity-0 pointer-events-none` : wrapperClassName
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {swipeable ? (
        <span aria-hidden="true" style={revealStyle} className={actionClassName}>
          <span data-side={side} className={indicatorClassName}>
            {entry.unread ? (
              <Icon name="check" className="size-6" />
            ) : (
              <Icon name="unread-only" className="size-6" />
            )}
            <span>{toggleLabel}</span>
          </span>
        </span>
      ) : null}
      <div
        style={{
          translate: `${dragX}px 0`,
          opacity: flying ? 0 : undefined,
          // Under the finger the mover follows without easing; the fly-out and the snap back ease.
          transition: dragging ? "none" : undefined,
        }}
        className={moverClassName}
      >
        {/* The visible title moved out of the card, so its accessible name is spelled out. */}
        {directOpen ? (
          <a
            href={original}
            target="_blank"
            rel="noopener"
            aria-label={title}
            onClick={handleDirectClick}
            {...cardProps}
          />
        ) : (
          <Link
            to="/stream/$streamKey/entry/$entryId"
            params={{ streamKey, entryId: entry.id }}
            search={(prev) => prev}
            viewTransition
            aria-label={title}
            onClick={handleCardClick}
            {...cardProps}
          />
        )}
        {/* Painted over the card link and deaf to the pointer, so a click anywhere but the title
          still falls through to it. The clip lives one level in, so the link's focus ring shows. */}
        <span
          style={hueStyle}
          className={`
          tile-card pointer-events-none relative block size-full rounded-xl
          bg-surface-2
        `}
        >
          {hasImage ? (
            <img
              src={image.src}
              onError={image.onError}
              alt=""
              loading="lazy"
              decoding="async"
              className={`
              block size-full object-cover object-top
              group-data-read/tile:grayscale group-data-read/tile:opacity-70
            `}
            />
          ) : null}
          <span
            className={`
            flex flex-col
            tile-glass
            group-not-data-has-image/tile:size-full group-not-data-has-image/tile:justify-end
            group-not-data-has-image/tile:p-3 group-not-data-has-image/tile:pt-10
          `}
          >
            <Masthead
              originTitle={originTitle}
              title={title}
              original={original}
              directOpen={directOpen}
              tabIndex={tabIndex}
              onFocus={onFocus}
              onTitleClick={handleClick}
            />
          </span>
          <Chip entry={entry} />
        </span>
        <button
          type="button"
          tabIndex={-1}
          {...tip({ label: toggleLabel, shortcut: "M" })}
          onClick={handleToggle}
          className={buttonClassName}
        >
          {entry.unread ? (
            <Icon name="check" className="size-4" />
          ) : (
            <Icon name="unread-only" className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
};
