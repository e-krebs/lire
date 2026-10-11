import { useCallback, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { PanelExitContext } from "./PanelExitContext";
import type { PanelShellProps } from "./shared";
import { useAfterExit } from "./useAfterExit";

// WebKit never focuses a clicked <button>: it focuses the closest focusable ancestor, or `body`.
// So the last pressed control is tracked from load, since the panel mounts after the press.
let lastPressed: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target;
      lastPressed =
        target instanceof Element
          ? target.closest<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")
          : null;
    },
    true,
  );
}

// Floats over the list from `sm` up, behind a scrim, so it needs a `relative h-full` ancestor
// outside the list's scroll pane. Not a dialog, so focus goes in and comes back by hand.
export const FloatingPanel = ({
  open,
  onClose,
  headingId,
  focusHeading,
  closeRef,
  children,
}: PanelShellProps) => {
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  const onExited = useContext(PanelExitContext);
  const closing = onExited !== null;
  useAfterExit(panelRef, onExited);
  const closingRef = useRef(closing);
  useEffect(() => {
    // A take-back (the same row reopened during the exit) keeps the panel mounted and open.
    if (closingRef.current && !closing && open) focusHeading();
    closingRef.current = closing;
  }, [closing, open, focusHeading]);

  // An element around the panel, such as `body` or a scroll pane, is never the trigger. Nor is
  // one inside a <dialog> such as ConfirmDialog, which is closed by the time focus comes back.
  const asTrigger = useCallback((element: EventTarget | null): HTMLElement | null => {
    const panel = panelRef.current;
    return element instanceof HTMLElement &&
      !panel?.contains(element) &&
      !element.contains(panel) &&
      element.closest("dialog") === null
      ? element
      : null;
  }, []);
  // Before paint: the list goes inert in the same commit, and the browser then drops its focus.
  useLayoutEffect(() => {
    if (open) triggerRef.current = asTrigger(document.activeElement) ?? asTrigger(lastPressed);
  }, [open, asTrigger]);

  useEffect(() => {
    if (!open) return undefined;
    focusHeading();
    // Whatever outside control is pressed or focused while the panel is open becomes the trigger
    // focus returns to.
    const onOutside = (element: EventTarget | null): void => {
      const trigger = asTrigger(element);
      if (trigger) triggerRef.current = trigger;
    };
    const onFocusIn = (event: FocusEvent): void => {
      onOutside(event.target);
    };
    // A click outside, on the scrim or the top bar, closes the panel and still reaches its target.
    // A modal over the panel is its own layer, and a drag out of the panel is no click.
    const isOutside = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      panelRef.current?.contains(target) === false &&
      target.closest("dialog") === null;
    let pressedOutside = false;
    const onPointerDown = (event: PointerEvent): void => {
      onOutside(lastPressed);
      pressedOutside = isOutside(event.target);
    };
    // Capture, so it runs before the target's own click handler.
    const onClick = (event: MouseEvent): void => {
      if (pressedOutside && isOutside(event.target) && !closingRef.current) onCloseRef.current();
      pressedOutside = false;
    };
    // Still listening while the exit plays, so a row pressed then is where focus goes once the
    // panel is gone: the cleanup below runs at unmount.
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      const trigger = triggerRef.current;
      triggerRef.current = null;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, focusHeading, asTrigger]);

  if (!open) return null;
  return (
    <>
      {/* Its click reaches the document listener above, which closes the panel. */}
      <div aria-hidden="true" data-closing={closing || undefined} className="side-panel-scrim" />
      <aside
        ref={panelRef}
        aria-labelledby={headingId}
        data-side-panel=""
        data-closing={closing || undefined}
        inert={closing}
        className="side-panel bg-surface text-ink"
      >
        {children}
      </aside>
    </>
  );
};
