import { useT } from "client/i18n/useT";
import { dismissOffline } from "client/utils/pwaUpdate";
import { Toast, ToastButton } from "./Toast";

export const OfflineToast = () => {
  const { shell } = useT();
  return (
    <Toast>
      {shell.offlineReady}
      <ToastButton onClick={dismissOffline}>{shell.dismiss}</ToastButton>
    </Toast>
  );
};
