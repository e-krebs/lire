import { use, useEffect, useLayoutEffect, useRef } from "react";
import { useBackdropDismiss } from "client/components/primitives/overlays/ConfirmDialog";
import { useModalDialog } from "client/hooks/useModalDialog";
import { PanelExitContext } from "./PanelExitContext";
import type { PanelShellProps } from "./shared";
import { useAfterExit } from "./useAfterExit";

// Below `sm`: a bottom sheet on a native <dialog>, the same pattern as the navigator's PhoneSheet.
export const BottomSheet = ({
  open,
  onClose,
  headingId,
  focusHeading,
  closeRef,
  children,
}: PanelShellProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onExited = use(PanelExitContext);
  const closing = onExited !== null;
  // A close the owner started is no close request.
  const closingRef = useRef(closing);
  const { show, close } = useModalDialog({
    dialogRef,
    onClose,
    shouldNotify: () => !closingRef.current,
  });

  // Closing keeps the sheet mounted: close() runs its exit transition (styles.css), and a reopen
  // during it shows the same sheet again.
  useEffect(() => {
    closingRef.current = closing;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !closing) {
      if (!dialog.open) show(dialog);
      focusHeading();
      return;
    }
    if (dialog.open) close(dialog);
  }, [open, closing, show, close, focusHeading]);
  useAfterExit(dialogRef, onExited);

  const requestClose = (): void => {
    const dialog = dialogRef.current;
    if (dialog) close(dialog);
  };

  useLayoutEffect(() => {
    closeRef.current = requestClose;
  });

  const backdropDismiss = useBackdropDismiss(requestClose);

  return (
    // Backdrop light-dismiss: Esc already closes the dialog from the keyboard.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      data-side-panel=""
      data-closing={closing || undefined}
      {...backdropDismiss}
      className={`
        side-sheet fixed inset-x-0 top-auto bottom-0 m-0 hidden max-h-[85dvh] w-full max-w-full
        flex-col overscroll-contain rounded-t-2xl border-0 bg-surface p-0 pb-safe text-ink
        shadow-2xl
        backdrop:bg-scrim/35
        open:flex
      `}
    >
      <div className="flex flex-none justify-center pt-2">
        <span className="h-1 w-9 rounded-full bg-hairline" />
      </div>
      {children}
    </dialog>
  );
};
