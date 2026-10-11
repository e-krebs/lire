import { useCallback, useEffect, useId, useRef } from "react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { useT } from "client/i18n/useT";

// A click on a modal <dialog>'s ::backdrop targets the <dialog> itself, and so do a click on its
// padding and a drag that ends outside. So both the press and the click must land outside its box.
export const useBackdropDismiss = (onDismiss: () => void) => {
  const pressedOutsideRef = useRef(false);
  const isOnBackdrop = (event: MouseEvent<HTMLDialogElement>): boolean => {
    if (event.target !== event.currentTarget) return false;
    const box = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    );
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLDialogElement>): void => {
      pressedOutsideRef.current = isOnBackdrop(event);
    },
    onClick: (event: MouseEvent<HTMLDialogElement>): void => {
      if (pressedOutsideRef.current && isOnBackdrop(event)) onDismiss();
      pressedOutsideRef.current = false;
    },
  };
};

interface ConfirmDialogProps {
  /** Dialog is shown. */
  open: boolean;
  /** Cancel clicked, Escape pressed or backdrop clicked. */
  onCancel: () => void;
  /** Confirm button clicked. */
  onConfirm: () => void;
  /** Dialog heading. */
  title: string;
  /** Body text explaining what is about to happen. */
  children: ReactNode;
  /** A field the confirmation needs, e.g. the target category for a delete's orphans. */
  extra?: ReactNode;
  /** Names the effect, rule #55: "Unsubscribe", never "OK". */
  confirmLabel: string;
  /** Confirm is not yet allowed, e.g. a required field is empty. */
  confirmDisabled?: boolean;
  /** The action is running: Cancel, Escape and the backdrop cannot close the dialog. */
  busy?: boolean;
}

const buttonClassName = `
  min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  disabled:cursor-default disabled:opacity-50
  motion-safe:transition-colors
`;

// A centred native <dialog>: the one modal of the page, kept for destructive steps. It grows out
// of whatever opened it (rule #7), so the origin is the trigger's centre in the dialog's box.
export const ConfirmDialog = ({
  open,
  onCancel,
  onConfirm,
  title,
  children,
  extra,
  confirmLabel,
  confirmDisabled = false,
  busy = false,
}: ConfirmDialogProps) => {
  const t = useT();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // Set while the caller closes it, so that close reads as neither cancel nor Escape.
  const closingFromPropRef = useRef(false);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  const closeDialogElement = useCallback((dialog: HTMLDialogElement): void => {
    if (typeof dialog.showModal === "function") {
      dialog.close();
      return;
    }
    // jsdom: no showModal()/close(), so no native "close" event and no focus restore either.
    dialog.removeAttribute("open");
    if (triggerRef.current?.isConnected) triggerRef.current.focus();
    if (closingFromPropRef.current) closingFromPropRef.current = false;
    else onCancelRef.current();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (dialog.open) return;
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      const trigger = triggerRef.current?.getBoundingClientRect();
      const box = dialog.getBoundingClientRect();
      dialog.style.transformOrigin = trigger
        ? `${trigger.left + trigger.width / 2 - box.left}px ${trigger.top + trigger.height / 2 - box.top}px`
        : "";
      return;
    }
    if (!dialog.open) return;
    closingFromPropRef.current = true;
    closeDialogElement(dialog);
  }, [open, closeDialogElement]);

  // Escape and the Cancel button both end in "close".
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const handleClose = (): void => {
      if (closingFromPropRef.current) closingFromPropRef.current = false;
      else onCancelRef.current();
    };
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("close", handleClose);
    };
  }, []);

  // Without fresh user activation, Chrome closes on Escape with no cancelable "cancel", and a
  // cancelled keydown never becomes a close request. On `document`, since focus can sit on `body`
  // (after a click on the dialog's text, or once the focused button turns disabled).
  useEffect(() => {
    if (!open || !busy) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, busy]);

  const backdropDismiss = useBackdropDismiss(() => {
    if (busy) return;
    const dialog = dialogRef.current;
    if (dialog) closeDialogElement(dialog);
  });

  return (
    // Backdrop light-dismiss: Esc already closes the dialog from the keyboard.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...backdropDismiss}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      className={`
        confirm-dialog m-auto hidden w-[calc(100%-2rem)] max-w-sm flex-col gap-4 rounded-2xl
        border-0 bg-surface p-5 text-ink shadow-2xl
        backdrop:bg-scrim/35
        open:flex
      `}
    >
      <h2 id={titleId} className="text-base font-semibold text-balance">
        {title}
      </h2>
      <div className="text-sm text-pretty text-muted">{children}</div>
      {extra}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const dialog = dialogRef.current;
            if (dialog) closeDialogElement(dialog);
          }}
          className={`${buttonClassName} bg-surface-2 text-ink hover:not-disabled:bg-hairline`}
        >
          {t.common.cancel}
        </button>
        <button
          type="button"
          disabled={confirmDisabled}
          onClick={onConfirm}
          className={`${buttonClassName} bg-danger text-surface hover:not-disabled:bg-danger/90`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
};
