import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlay, useOverlayOpen } from "client/hooks/useOverlay";
import { swallowNextClick } from "client/utils/swallowNextClick";

interface AddSourcesMenuProps {
  /** "Add website" item picked. */
  onAddWebsite: () => void;
  /** "Add newsletter" item picked. */
  onAddNewsletter: () => void;
  /** Classes of the trigger button. */
  className: string;
}

const itemClassName = `
  w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-surface-2
`;

// jsdom does not know :popover-open.
const isPopoverOpen = (element: HTMLElement | null): boolean => {
  try {
    return element?.matches(":popover-open") ?? false;
  } catch {
    return false;
  }
};

export const AddSourcesMenu = ({
  onAddWebsite,
  onAddNewsletter,
  className,
}: AddSourcesMenuProps) => {
  const id = useId();
  const anchorName = `--add-sources-${id.replaceAll(":", "")}`;
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // A modal <dialog> (the phone sheet) makes everything outside it inert, a body-level popover too.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const pickedRef = useRef(false);
  const restoreFocusRef = useRef(false);
  useOverlay({ id: `add-sources-${id}`, isOpen: open });
  const overlayOpen = useOverlayOpen();

  useLayoutEffect(() => {
    setPortalTarget(triggerRef.current?.closest("dialog") ?? document.body);
  }, []);

  // The browser restores focus to the trigger while <main> is still inert, so it is done here once
  // the overlay has cleared.
  useEffect(() => {
    if (open || overlayOpen || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [open, overlayOpen]);

  // Light dismiss would let the closing press click whatever sits under it, so that click is
  // swallowed. The trigger is excluded, since its own click is the toggle.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return;
      if (popoverRef.current?.contains(event.target)) return;
      if (triggerRef.current?.contains(event.target)) return;
      swallowNextClick();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  const pick = (callback: () => void): void => {
    pickedRef.current = true;
    popoverRef.current?.hidePopover();
    callback();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        onKeyDown={(event) => {
          // Focus stays on the trigger when the menu opens, so Escape starts here. The toggle event
          // that sets `open` lands a task later, so the popover itself is asked too.
          if (event.key === "Escape" && (open || isPopoverOpen(popoverRef.current))) {
            event.stopPropagation();
          }
        }}
        style={{ anchorName }}
        className={className}
      >
        ＋ Add sources
      </button>
      {/* Portaled out of <main>: that goes inert while the menu is open, and inert follows the DOM
          tree, not the top layer. */}
      {portalTarget &&
        createPortal(
          <div
            ref={popoverRef}
            id={id}
            popover="auto"
            role="group"
            aria-label="Add sources"
            style={{ positionAnchor: anchorName }}
            onToggle={(event) => {
              const isOpen = event.newState === "open";
              if (isOpen) pickedRef.current = false;
              else if (!pickedRef.current) {
                const active = document.activeElement;
                restoreFocusRef.current =
                  !active || active === document.body || !!popoverRef.current?.contains(active);
              }
              setOpen(isOpen);
            }}
            onKeyDown={(event) => {
              // Not preventDefault: the native light dismiss still has to close the popover.
              if (event.key === "Escape") event.stopPropagation();
            }}
            className="add-sources-menu w-48 rounded-2xl border border-hairline bg-surface p-2 text-ink shadow-lg"
          >
            <button
              type="button"
              onClick={() => {
                pick(onAddWebsite);
              }}
              className={itemClassName}
            >
              Add website
            </button>
            <button
              type="button"
              onClick={() => {
                pick(onAddNewsletter);
              }}
              className={itemClassName}
            >
              Add newsletter
            </button>
          </div>,
          portalTarget,
        )}
    </>
  );
};
