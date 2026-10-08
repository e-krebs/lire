import { useEffect, useRef, useState } from "react";

type PullEdge = "top" | "bottom";

export interface PullState {
  edge: PullEdge;
  // Damped, in pixels.
  distance: number;
  armed: boolean;
  refreshing: boolean;
  // The finger is gone and the pull is sliding back to 0; the state clears once it has.
  released: boolean;
}

export const PULL_THRESHOLD = 72;
// The disc stays this long at least: a cached answer would otherwise flash it for a frame or two.
const MIN_REFRESH_MS = 400;
// How long the slide back takes; matches the `translate` transition in styles.css.
const RETRACT_MS = 200;

// A bottom touch stays a plain scroll until it travels this far, so one that would still reach the
// pagination sentinel is not eaten.
const BOTTOM_SLOP = 8;

const MAX_DISTANCE = PULL_THRESHOLD * 1.5;
// Where the disc parks while the request is in flight.
const SNAP_DISTANCE = PULL_THRESHOLD * 0.75;

// Rubber band: 1:1 at first, then ever stiffer towards the cap, the way a native pull yields.
// Arms after about 119px of travel.
const dampen = (travel: number): number =>
  MAX_DISTANCE * (1 - Math.exp(-Math.max(travel, 0) / MAX_DISTANCE));

// `pending` is a touch that began at an edge but hasn't said yet whether it is a pull or a plain
// scroll; once it reads as a scroll the gesture is dropped and the pane keeps the touch.
type Gesture =
  | { phase: "pending"; startX: number; startY: number; atTop: boolean; atBottom: boolean }
  | { phase: "pulling"; startX: number; startY: number; edge: PullEdge; distance: number };

interface Pull {
  // Callback ref: the grid mounts after a skeleton, so a RefObject would never re-arm.
  attach: (element: HTMLElement | null) => void;
  pull: PullState | null;
}

interface PullOptions {
  // A promise holds the disc as a status until it settles; nothing returned slides it straight
  // back, for a commit that acts at once.
  onCommit: (args: { edge: PullEdge }) => Promise<unknown> | undefined;
  // A same-origin frame inside the pane keeps its touches in its own document, so they are heard
  // there too. The pane still does the scrolling, so its edges still decide.
  frameDocument?: Document | null;
  pullDown: boolean;
  pullUp: boolean;
}

/** A touch-only pull past either end of the `.scroll-pane` around `attach`, and the state to draw it. */
export const usePull = ({ onCommit, frameDocument, pullDown, pullUp }: PullOptions): Pull => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [pull, setPull] = useState<PullState | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const refreshing = useRef(false);
  // Read from inside the listeners, so a new callback or a flipped edge never resubscribes them
  // mid-gesture.
  const latest = useRef({ onCommit, pullDown, pullUp });

  useEffect(() => {
    latest.current = { onCommit, pullDown, pullUp };
  });

  useEffect(() => {
    const scroller = element?.closest<HTMLElement>(".scroll-pane");
    if (!scroller) return undefined;

    let retractTimer: number | undefined;
    // Back to 0 with the transition on, then out of the tree once it has played.
    const release = ({ edge, armed }: { edge: PullEdge; armed: boolean }): void => {
      setPull({ edge, distance: 0, armed, refreshing: false, released: true });
      window.clearTimeout(retractTimer);
      retractTimer = window.setTimeout(() => {
        setPull(null);
      }, RETRACT_MS);
    };

    const settle = (edge: PullEdge): void => {
      refreshing.current = false;
      release({ edge, armed: true });
    };

    const onTouchStart = (event: TouchEvent): void => {
      if (refreshing.current) return;
      gesture.current = null;
      // A new finger takes over from a slide back still playing.
      if (retractTimer !== undefined) {
        window.clearTimeout(retractTimer);
        retractTimer = undefined;
        setPull(null);
      }
      if (event.touches.length !== 1) return;
      const atTop = latest.current.pullDown && scroller.scrollTop <= 0;
      const atBottom =
        latest.current.pullUp &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if (!atTop && !atBottom) return;
      gesture.current = {
        phase: "pending",
        startX: event.touches[0].clientX,
        startY: event.touches[0].clientY,
        atTop,
        atBottom,
      };
    };

    const onTouchMove = (event: TouchEvent): void => {
      if (refreshing.current) return;
      const current = gesture.current;
      if (!current) return;
      if (event.touches.length !== 1) {
        gesture.current = null;
        setPull(null);
        return;
      }
      const dy = event.touches[0].clientY - current.startY;

      let edge: PullEdge;
      if (current.phase === "pulling") {
        edge = current.edge;
      } else if (Math.abs(event.touches[0].clientX - current.startX) > Math.abs(dy)) {
        // Sideways first: a card swipe, which a finger drifting a pixel down must not turn into
        // a pull.
        gesture.current = null;
        return;
      } else if (dy > 0 && current.atTop) {
        edge = "top";
      } else if (dy < 0 && current.atBottom) {
        if (-dy < BOTTOM_SLOP) return;
        edge = "bottom";
      } else {
        // Away from the eligible edge: a scroll, so it is left alone. A dead-still finger stays
        // undecided.
        if (dy !== 0) gesture.current = null;
        return;
      }

      // Clamped to the pull's own direction, so dragging back past the start unwinds the disc
      // rather than growing it again.
      const distance = dampen(edge === "top" ? dy : -dy);
      gesture.current = {
        phase: "pulling",
        startX: current.startX,
        startY: current.startY,
        edge,
        distance,
      };
      // Stops iOS rubber-banding while the disc is the one moving.
      event.preventDefault();
      setPull({
        edge,
        distance,
        armed: distance >= PULL_THRESHOLD,
        refreshing: false,
        released: false,
      });
    };

    const onTouchEnd = (): void => {
      if (refreshing.current) return;
      const current = gesture.current;
      gesture.current = null;
      if (current?.phase !== "pulling") return;
      if (current.distance < PULL_THRESHOLD) {
        release({ edge: current.edge, armed: false });
        return;
      }
      const committed = latest.current.onCommit({ edge: current.edge });
      if (committed === undefined) {
        release({ edge: current.edge, armed: true });
        return;
      }
      refreshing.current = true;
      setPull({
        edge: current.edge,
        distance: SNAP_DISTANCE,
        armed: true,
        refreshing: true,
        released: false,
      });
      const hold = new Promise<void>((resolve) => {
        setTimeout(resolve, MIN_REFRESH_MS);
      });
      void Promise.allSettled([committed, hold]).then(() => {
        settle(current.edge);
      });
    };

    const onTouchCancel = (): void => {
      if (refreshing.current) return;
      const current = gesture.current;
      gesture.current = null;
      if (current?.phase === "pulling") release({ edge: current.edge, armed: false });
    };

    const targets = frameDocument ? [scroller, frameDocument.documentElement] : [scroller];
    for (const target of targets) {
      target.addEventListener("touchstart", onTouchStart, { passive: true });
      target.addEventListener("touchmove", onTouchMove, { passive: false });
      target.addEventListener("touchend", onTouchEnd);
      target.addEventListener("touchcancel", onTouchCancel);
    }
    return () => {
      window.clearTimeout(retractTimer);
      for (const target of targets) {
        target.removeEventListener("touchstart", onTouchStart);
        target.removeEventListener("touchmove", onTouchMove);
        target.removeEventListener("touchend", onTouchEnd);
        target.removeEventListener("touchcancel", onTouchCancel);
      }
    };
  }, [element, frameDocument]);

  return { attach: setElement, pull };
};

interface PullToRefreshOptions {
  onRefresh: (args: { edge: PullEdge }) => Promise<unknown>;
  pullUp: boolean;
}

/** Pull to refresh: both ends of the pane, the disc held until the refresh settles. */
export const usePullToRefresh = ({ onRefresh, pullUp }: PullToRefreshOptions): Pull =>
  usePull({ onCommit: onRefresh, pullDown: true, pullUp });
