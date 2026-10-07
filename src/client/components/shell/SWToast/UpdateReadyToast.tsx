import { useEffect, useState } from "react";
import { useT } from "client/i18n/useT";
import { applyUpdate, deferUpdate } from "client/utils/pwaUpdate";
import { Toast, ToastButton } from "./Toast";

const FLIGHT_FALLBACK_MS = 400;

export const UpdateReadyToast = () => {
  const { shell } = useT();
  const [leaving, setLeaving] = useState(false);

  // The flight ends on an animationend. Without one (animations off, a cancel), Later would do nothing.
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => {
      setLeaving(false);
      deferUpdate();
    }, FLIGHT_FALLBACK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [leaving]);

  return (
    <Toast
      leaving={leaving}
      onLeft={() => {
        setLeaving(false);
        deferUpdate();
      }}
    >
      {shell.updateReady}
      <ToastButton
        onClick={() => {
          void applyUpdate();
        }}
      >
        {shell.reload}
      </ToastButton>
      <ToastButton
        onClick={() => {
          setLeaving(true);
        }}
      >
        {shell.later}
      </ToastButton>
    </Toast>
  );
};
