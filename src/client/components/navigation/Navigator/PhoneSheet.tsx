import { Fragment, useCallback, useEffect, useRef } from "react";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { useBarPosition } from "client/hooks/useBarPosition";
import type { NavigatorPanelHandle } from "client/components/navigation/NavigatorPanel";
import { useT } from "client/i18n/useT";
import { SheetField } from "./SheetField";
import { SheetHandle } from "./SheetHandle";

interface PhoneSheetProps {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  panelHandleRef: RefObject<NavigatorPanelHandle | null>;
  clearable: boolean;
  scopeLabel: string;
  onClearScope: () => void;
  onClearText: () => void;
  children: ReactNode;
}

// The phone sheet: a downward drag past the slop rides the finger, past the distance it closes.
const SHEET_DRAG_SLOP = 8;
const SHEET_CLOSE_DISTANCE = 96;
// Less of the layout viewport hidden than this is a browser bar moving, not a keyboard.
const KEYBOARD_MIN_HEIGHT = 100;

// Which edge the sheet hangs from: it fills the screen from the app bar's edge inwards, and
// rounds only its far side.
const sheetClassName = `
  bottom-0 top-[env(safe-area-inset-top,0px)] h-[calc(100dvh-env(safe-area-inset-top,0px))]
  rounded-t-2xl
  bar-bottom:top-0 bar-bottom:bottom-[env(safe-area-inset-bottom,0px)]
  bar-bottom:h-[calc(100dvh-env(safe-area-inset-bottom,0px))] bar-bottom:rounded-t-none
  bar-bottom:rounded-b-2xl
`;

// Native <dialog>: `showModal()`/`close()` drive an external widget the render can't derive from
// (focus trap, top layer, `::backdrop`) — the two Effects below just keep it in sync with `open`.
// The sheet mirrors itself around the app bar: bar at the top, it hangs from the top edge with the
// handle and the field above the results; bar at the bottom, it hangs from the bottom edge with
// the results above them, so both stay under the thumb.
export const PhoneSheet = ({
  open,
  onClose,
  query,
  onQueryChange,
  panelHandleRef,
  clearable,
  scopeLabel,
  onClearScope,
  onClearText,
  children,
}: PhoneSheetProps) => {
  const t = useT().navigation;
  const position = useBarPosition();
  const atBottom = position === "bottom";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The parent passes a fresh `onClose` every render; read it through a ref so the open/close
  // Effect below runs on `open` alone and never re-focuses the field while someone types in a row.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // jsdom (Vitest) doesn't implement showModal()/close() — falling back to the plain `open`
  // attribute (and calling `onClose` ourselves, since removing it fires no native "close" event)
  // keeps the component testable there; real browsers always take the modal path.
  const closeDialogElement = useCallback((dialog: HTMLDialogElement): void => {
    // Same feature flag as the open path: jsdom's partial `close()` exists but doesn't flip the
    // `open` attribute or fire the "close" event, so it can't be trusted on its own.
    if (typeof dialog.showModal === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
      onCloseRef.current();
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (open) {
      if (!dialog.open) {
        // A swipe-down close leaves the sheet translated off screen; back in place before it shows.
        dialog.style.transition = "";
        dialog.style.translate = "";
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => {
        cancelAnimationFrame(raf);
      };
    }
    if (dialog.open) closeDialogElement(dialog);
    return undefined;
  }, [open, closeDialogElement]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const handleClose = (): void => {
      onClose();
    };
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("close", handleClose);
    };
  }, [onClose]);

  // With the field at the sheet's bottom edge, an on-screen keyboard would cover it: `100dvh`
  // does not shrink for the keyboard on iOS, while Android shrinks the whole layout viewport (the
  // viewport meta in index.html). Either way the visual viewport's bottom edge, in layout
  // coordinates, is `offsetTop + height`, and the sheet's height is what puts its own bottom
  // there, measured from wherever its top sits. The keyboard is whatever the tallest viewport seen
  // lost; while it is up the grab handle goes, so the field sits flush on the keys.
  useEffect(() => {
    const dialog = dialogRef.current;
    const viewport = window.visualViewport;
    if (!dialog || !open || !atBottom || !viewport) return undefined;
    let tallest = 0;
    const fit = (): void => {
      const bottom = viewport.offsetTop + viewport.height;
      tallest = Math.max(tallest, window.innerHeight);
      dialog.style.height = `${bottom - dialog.getBoundingClientRect().top}px`;
      if (tallest - bottom > KEYBOARD_MIN_HEIGHT) dialog.dataset.keyboard = "";
      else delete dialog.dataset.keyboard;
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      dialog.style.height = "";
      delete dialog.dataset.keyboard;
    };
  }, [open, atBottom]);

  // Sliding the sheet away from the bar closes it: down when the bar is at the top, up when it is
  // at the bottom, and only once every list under the finger has reached the edge the sheet leaves
  // by. The sheet rides the finger, then springs back or leaves. Touch listeners on the dialog
  // node, non-passive on move so the list does not scroll under the drag.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    // Which way "away from the bar" points; `travel` below is the drag measured along it.
    const direction = atBottom ? -1 : 1;
    let startY: number | undefined;
    let dragging = false;

    const scrolledBetween = (target: EventTarget | null): boolean => {
      let node = target instanceof Element ? target : null;
      while (node && node !== dialog) {
        const atEdge =
          direction > 0
            ? node.scrollTop <= 0
            : node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
        if (!atEdge) return true;
        node = node.parentElement;
      }
      return false;
    };
    const reset = (): void => {
      dialog.style.transition = "";
      dialog.style.translate = "";
    };
    const onTouchStart = (event: TouchEvent): void => {
      startY =
        event.touches.length === 1 && !scrolledBetween(event.target)
          ? event.touches[0].clientY
          : undefined;
      dragging = false;
    };
    const onTouchMove = (event: TouchEvent): void => {
      if (startY === undefined || event.touches.length !== 1) return;
      const travel = (event.touches[0].clientY - startY) * direction;
      if (!dragging) {
        // Back towards the bar, or not yet past the slop: a scroll, left to the list.
        if (travel < SHEET_DRAG_SLOP) {
          if (travel < 0) startY = undefined;
          return;
        }
        dragging = true;
        dialog.style.transition = "none";
      }
      event.preventDefault();
      dialog.style.translate = `0 ${Math.max(travel, 0) * direction}px`;
    };
    const onTouchEnd = (event: TouchEvent): void => {
      if (startY === undefined) return;
      const touch = event.changedTouches.item(0);
      const travel = ((touch?.clientY ?? startY) - startY) * direction;
      startY = undefined;
      if (!dragging) return;
      dragging = false;
      if (travel >= SHEET_CLOSE_DISTANCE) {
        // Keeps sliding away while the stylesheet's close transition fades it, so it never snaps
        // back against the bar for a frame first. The open path clears these two.
        dialog.style.transition = "translate 150ms ease";
        dialog.style.translate = direction > 0 ? "0 100%" : "0 -100%";
        closeDialogElement(dialog);
        return;
      }
      dialog.style.transition = "translate 200ms ease";
      dialog.style.translate = "0 0px";
      dialog.addEventListener("transitionend", reset, { once: true });
    };

    dialog.addEventListener("touchstart", onTouchStart, { passive: true });
    dialog.addEventListener("touchmove", onTouchMove, { passive: false });
    dialog.addEventListener("touchend", onTouchEnd);
    dialog.addEventListener("touchcancel", onTouchEnd);
    return () => {
      dialog.removeEventListener("touchstart", onTouchStart);
      dialog.removeEventListener("touchmove", onTouchMove);
      dialog.removeEventListener("touchend", onTouchEnd);
      dialog.removeEventListener("touchcancel", onTouchEnd);
      reset();
    };
  }, [closeDialogElement, atBottom]);

  const requestClose = (): void => {
    const dialog = dialogRef.current;
    if (dialog) closeDialogElement(dialog);
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === dialogRef.current) requestClose();
  };

  return (
    // Backdrop light-dismiss: Esc already gives full keyboard equivalence for closing this dialog.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
    <dialog
      ref={dialogRef}
      aria-label={t.navigator}
      onClick={handleBackdropClick}
      className={`
        navigator fixed inset-x-0 m-0 hidden max-h-none w-full max-w-full flex-col
        overscroll-contain border-0 bg-surface p-0 text-ink shadow-2xl
        ${sheetClassName}
        open:flex
        backdrop:bg-scrim/35
      `}
    >
      {/* Keyed rows, so flipping the bar position moves them instead of remounting the field. */}
      <div className="flex h-full min-h-0 flex-col">
        {(atBottom
          ? (["panel", "field", "handle"] as const)
          : (["handle", "field", "panel"] as const)
        ).map((section) => {
          if (section === "handle") return <SheetHandle key="handle" />;
          if (section === "field") {
            return (
              <SheetField
                key="field"
                inputRef={inputRef}
                query={query}
                onQueryChange={onQueryChange}
                panelHandleRef={panelHandleRef}
                clearable={clearable}
                scopeLabel={scopeLabel}
                onClearScope={onClearScope}
                onClearText={onClearText}
              />
            );
          }
          return <Fragment key="panel">{children}</Fragment>;
        })}
      </div>
    </dialog>
  );
};
