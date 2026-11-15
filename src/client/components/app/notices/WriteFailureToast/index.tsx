import { useEffect } from "react";
import { useT } from "client/i18n/useT";
import { dismissWriteFailure, useWriteFailure } from "client/utils/writeFailure";
import { Toast, ToastButton } from "client/components/primitives/feedback/Toast";

const AUTO_DISMISS_MS = 6000;

// Sits one toast-height above the SWToast bar. The status element stays mounted so a screen
// reader announces the failure when it appears.
export const WriteFailureToast = () => {
  const { shell } = useT();
  const { failureId } = useWriteFailure();

  // A new failure changes failureId, so the cleanup restarts the countdown.
  useEffect(() => {
    if (failureId === 0) return undefined;
    const timer = setTimeout(dismissWriteFailure, AUTO_DISMISS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [failureId]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(3.5rem+max(1rem,env(safe-area-inset-bottom)))]">
      <div role="status">
        {failureId > 0 ? (
          <Toast>
            {shell.writeFailed}
            <ToastButton onClick={dismissWriteFailure}>{shell.dismiss}</ToastButton>
          </Toast>
        ) : null}
      </div>
    </div>
  );
};
