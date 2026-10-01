import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

export const STORAGE_KEY = "lire.reader.width";
// Pixels, not rem: the panel only resizes at `lg`+, where the root font size is the browser's.
const DEFAULT_WIDTH = 640;
const MIN_WIDTH = 384;
// The results grid keeps at least this much of the viewport, so the panel can never swallow it.
const RESERVED_WIDTH = 320;
const KEYBOARD_STEP = 16;

const maxWidth = (): number => Math.max(MIN_WIDTH, window.innerWidth - RESERVED_WIDTH);

const clampWidth = (width: number): number => Math.min(Math.max(width, MIN_WIDTH), maxWidth());

// Storage throws in a private window with site data blocked, and holds whatever a previous
// version wrote, so both ends of the round trip are guarded.
const storedWidth = (): number | undefined => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const storeWidth = (width: number): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // The width just doesn't survive the reload.
  }
};

interface Drag {
  pointerId: number;
  startX: number;
  startWidth: number;
}

/** The reader panel's width, the drag/keyboard handle that changes it, and its persistence. */
export const useResizablePanel = () => {
  const [width, setWidth] = useState(() => clampWidth(storedWidth() ?? DEFAULT_WIDTH));
  const [max, setMax] = useState(() => maxWidth());
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);

  // A narrowing viewport must not leave the panel wider than its cap.
  useEffect(() => {
    const onResize = (): void => {
      setMax(maxWidth());
      setWidth(clampWidth);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const commit = useCallback((next: number): void => {
    const value = Math.round(clampWidth(next));
    setWidth(value);
    storeWidth(value);
  }, []);

  // Measured from where the drag started rather than from the panel's edge, so the grab point
  // stays under the pointer whatever the panel's own geometry.
  const widthAt = (clientX: number): number => {
    const current = drag.current;
    return current === null ? width : current.startWidth - (clientX - current.startX);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return;
    setWidth(clampWidth(widthAt(event.clientX)));
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return;
    const next = widthAt(event.clientX);
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commit(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // The panel hangs off the right edge, so dragging its handle leftwards widens it.
    if (event.key === "ArrowLeft") commit(width + KEYBOARD_STEP);
    else if (event.key === "ArrowRight") commit(width - KEYBOARD_STEP);
    else if (event.key === "Home") commit(MIN_WIDTH);
    else if (event.key === "End") commit(maxWidth());
    else return;
    event.preventDefault();
  };

  return {
    width,
    separatorProps: {
      role: "separator" as const,
      "aria-orientation": "vertical" as const,
      "aria-label": "Resize the article panel",
      "aria-valuenow": width,
      "aria-valuemin": MIN_WIDTH,
      "aria-valuemax": max,
      tabIndex: 0,
      "data-dragging": dragging ? "" : undefined,
      className: "reader-resize",
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onKeyDown,
    },
  };
};
