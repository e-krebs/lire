import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { Icon } from "client/components/ui/icons";
import { useT } from "client/i18n/useT";

// The strip sits in the slot the card had, so it never says which article it was: its place in
// the grid does. The bar under it is the clock — `styles.css` runs the `undo-tick` animation on
// the strip itself, hover and focus on Confirm pause it, and its end is what commits the read.
const UNDO_MS = 2000;
// Two 44px targets and one line of label. The grid gives the slot exactly this height.
export const UNDO_STRIP_HEIGHT = 60;

export interface StripAction {
  hadFocus: boolean;
}

interface UndoStripProps {
  /** The slot the masonry gave the strip, at the card's place and the strip's own height. */
  slot: { x: number; y: number; width: number };
  /** `hadFocus`: focus was inside the strip, so the grid hands it back to a card. */
  onUndo: (action: StripAction) => void;
  /** The delay ran out, or Confirm was clicked: the entry stays read and the slot closes. */
  onConfirm: (action: StripAction) => void;
  /** The card it replaced had focus, so Undo takes it. */
  autoFocus?: boolean;
  /** Confirmed: the strip fades out of the slot it still holds, then the grid closes the gap. */
  leaving?: boolean;
}

const stripClassName = `
  undo-strip absolute top-0 left-0 z-10 flex items-center gap-2 overflow-hidden
  rounded-xl bg-surface p-2 text-sm
  motion-safe:transition-[translate,opacity,scale] motion-safe:duration-200
`;

// Both buttons carry visible text, so the tooltip comes from `data-tip` alone: `tip()` would also
// set an `aria-label`, and a name that contradicts the word on the button.
const buttonClassName = `
  inline-flex h-11 flex-none items-center gap-1.5 rounded-full pr-4 pl-3.5
  focus-visible:outline-2 focus-visible:outline-accent
  motion-safe:transition-colors
`;

// Confirm is what the countdown does on its own, so it is the strip's filled action; Undo is the
// exception, and stays quiet beside it.
const confirmClassName = `${buttonClassName} undo-confirm bg-accent font-bold text-on-accent`;
const undoClassName = `${buttonClassName} bg-surface-2 font-semibold text-ink hover:bg-hairline`;

export const UndoStrip = ({
  slot,
  onUndo,
  onConfirm,
  autoFocus = false,
  leaving = false,
}: UndoStripProps) => {
  // The clock is a CSS animation, so `animationend` is the only timer: a paused animation is a
  // paused countdown, with no `setTimeout` left running beside it to keep in step. The listener is
  // a native one, because React's synthetic `onAnimationEnd` never fires under jsdom, which has no
  // `AnimationEvent`. `undo-tick` is the strip's own and only animation, so an event from a child
  // is somebody else's.
  const t = useT();
  const stripRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const action = (): StripAction => ({
    hadFocus: stripRef.current?.contains(document.activeElement) ?? false,
  });
  useEffect(() => {
    if (autoFocus) undoRef.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;
    const handleEnd = (event: Event): void => {
      if (event.target === strip) {
        onConfirm({ hadFocus: strip.contains(document.activeElement) });
      }
    };
    strip.addEventListener("animationend", handleEnd);
    return () => {
      strip.removeEventListener("animationend", handleEnd);
    };
  }, [onConfirm]);

  const style: CSSProperties & { "--undo-ms": string } = {
    translate: `${slot.x}px ${slot.y}px`,
    width: slot.width,
    height: UNDO_STRIP_HEIGHT,
    "--undo-ms": `${UNDO_MS}ms`,
  };

  return (
    <div
      ref={stripRef}
      data-leaving={leaving || undefined}
      inert={leaving || undefined}
      style={style}
      className={
        leaving ? `${stripClassName} scale-95 opacity-0 pointer-events-none` : stripClassName
      }
    >
      {/* The status is the label alone: focus sits on Undo, inside the strip, and a live region
          around it would announce twice. */}
      <span role="status" className="min-w-0 flex-1 truncate pl-1 font-medium">
        {t.articles.markedAsRead}
      </span>
      <button
        ref={undoRef}
        type="button"
        data-tip={t.articles.markAsUnread}
        onClick={() => {
          onUndo(action());
        }}
        className={undoClassName}
      >
        <Icon name="undo" className="size-4" />
        {t.common.undo}
      </button>
      <button
        type="button"
        data-tip={t.articles.keepReadAndClose}
        onClick={() => {
          onConfirm(action());
        }}
        className={confirmClassName}
      >
        <Icon name="check" className="size-4" />
        {t.common.confirm}
      </button>
      <span aria-hidden="true" className="undo-bar" />
    </div>
  );
};
