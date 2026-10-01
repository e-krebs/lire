import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useBarPosition } from "client/hooks/useBarPosition";
import { swallowNextClick } from "client/utils/swallowNextClick";
import { useOverlay } from "client/hooks/useOverlay";

const POPOVER_GAP = 6;

interface DesktopPopoverProps {
  open: boolean;
  onClose: () => void;
  onRequestFocus: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

interface PopoverRect {
  left: number;
  width: number;
  // Exactly one of the two, per bar position: hanging under the pill, or standing on top of it.
  top?: number;
  bottom?: number;
  // Down to (or up to) the edge of what is on screen, keyboard excluded, less a margin.
  maxHeight: number;
}

const POPOVER_MARGIN = 16;

// Omnibox style: the location bar itself is the search field (LocationBar renders it), this is
// just the results panel, a fixed box under it. Portalled to the body, because the header's
// backdrop-filter would make it the containing block for a fixed child; not a `popover`, because
// the top layer bought nothing here and an iPad's WebKit misplaced it on the first open. Showing
// it never steals focus from the field, and every dismissal path below is ours to drive. With the
// bar at the bottom it stands on the pill instead of hanging under it.
export const DesktopPopover = ({
  open,
  onClose,
  onRequestFocus,
  anchorRef,
  children,
}: DesktopPopoverProps) => {
  useOverlay({ id: "navigator", isOpen: open });
  const position = useBarPosition();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<PopoverRect | null>(null);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const box = anchor.getBoundingClientRect();
    // The visual viewport is what the on-screen keyboard leaves; on an iPad the layout one
    // still runs behind the keys.
    const viewport = window.visualViewport;
    // Flush with the pill's edges (the pill already caps its own width); the gap leaves the
    // pill's 2px focus ring uncovered.
    const edges = { left: box.left, width: box.width };
    if (position === "bottom") {
      // `bottom` on a fixed box counts from the *layout* viewport's bottom, which the keyboard
      // never shrinks, so the placement reads `innerHeight`; only the height is capped against
      // the visual viewport, whose own top sits `offsetTop` below the layout one.
      const room = box.top - (viewport?.offsetTop ?? 0) - POPOVER_GAP - POPOVER_MARGIN;
      setRect({
        ...edges,
        bottom: window.innerHeight - box.top + POPOVER_GAP,
        maxHeight: Math.max(160, room),
      });
      return;
    }
    const top = box.bottom + POPOVER_GAP;
    setRect({
      ...edges,
      top,
      maxHeight: Math.max(160, (viewport?.height ?? window.innerHeight) - top - POPOVER_MARGIN),
    });
  }, [anchorRef, position]);

  // Layout effect, so the measured position is painted with the very first open frame; the
  // frame after, once more, for a pill that was still settling.
  useLayoutEffect(() => {
    if (!open) return undefined;
    measure();
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return undefined;
    const viewport = window.visualViewport;
    window.addEventListener("resize", measure);
    // The keyboard coming up, or the page nudged under it, both move the anchor on screen.
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    // And the pill itself settling after a late layout, which is what a first open on a cold
    // tablet sees: the observer fires once on attach, then on every size change.
    const anchor = anchorRef.current;
    const observer =
      anchor && typeof ResizeObserver === "function" ? new ResizeObserver(measure) : undefined;
    if (anchor) observer?.observe(anchor);
    return () => {
      window.removeEventListener("resize", measure);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [open, measure, anchorRef]);

  // Manual popovers do none of Escape/outside-dismiss/blur themselves — we own all of it so the
  // field underneath keeps focus while the panel is open.
  useEffect(() => {
    if (!open) return undefined;

    const isInside = (target: unknown): boolean => {
      if (!(target instanceof Node)) return false;
      return !!anchorRef.current?.contains(target) || !!popoverRef.current?.contains(target);
    };

    const handlePointerDown = (event: PointerEvent): void => {
      if (isInside(event.target)) return;
      onClose();
      swallowNextClick();
    };
    const handleFocusIn = (event: FocusEvent): void => {
      if (!isInside(event.target)) onClose();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      onClose();
      onRequestFocus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, onRequestFocus, anchorRef]);

  return createPortal(
    <div
      ref={popoverRef}
      role="group"
      aria-label="Navigator"
      data-open={open && rect ? "" : undefined}
      className={`
        navigator-popover fixed z-30 hidden flex-col overflow-hidden rounded-xl border
        border-hairline bg-surface text-ink shadow-lg
        data-open:flex
      `}
      style={
        rect
          ? {
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              width: rect.width,
              maxHeight: rect.maxHeight,
            }
          : undefined
      }
    >
      {children}
    </div>,
    document.body,
  );
};
