import { useCallback, useEffect, useRef, type RefObject } from "react";

export const useModalDialog = ({
  dialogRef,
  onClose,
  shouldNotify,
  onFallbackClose,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  shouldNotify?: () => boolean;
  onFallbackClose?: () => void;
}): {
  show: (dialog: HTMLDialogElement) => void;
  close: (dialog: HTMLDialogElement) => void;
} => {
  // Read through refs so `show` and `close` keep their identity across renders.
  const onCloseRef = useRef(onClose);
  const shouldNotifyRef = useRef(shouldNotify);
  const onFallbackCloseRef = useRef(onFallbackClose);
  useEffect(() => {
    onCloseRef.current = onClose;
    shouldNotifyRef.current = shouldNotify;
    onFallbackCloseRef.current = onFallbackClose;
  }, [onClose, shouldNotify, onFallbackClose]);

  const notify = useCallback((): boolean => shouldNotifyRef.current?.() !== false, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const handleClose = (): void => {
      if (notify()) onCloseRef.current();
    };
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("close", handleClose);
    };
  }, [dialogRef, notify]);

  const show = useCallback((dialog: HTMLDialogElement): void => {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }, []);

  const close = useCallback(
    (dialog: HTMLDialogElement): void => {
      if (typeof dialog.showModal === "function") {
        dialog.close();
        return;
      }
      // jsdom: close() exists but neither flips `open` nor fires "close", so notify directly.
      dialog.removeAttribute("open");
      onFallbackCloseRef.current?.();
      if (notify()) onCloseRef.current();
    },
    [notify],
  );

  return { show, close };
};
