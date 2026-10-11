import { usePwaUpdate } from "client/utils/pwaUpdate";
import { OfflineToast } from "./OfflineToast";
import { UpdateReadyToast } from "./UpdateReadyToast";

// Picks the toast for the service worker's state. The status element stays mounted so a screen
// reader announces what appears in it.
export const SWToast = () => {
  const { updateReady, updateDeferred, offlineReady } = usePwaUpdate();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div role="status">
        {updateReady && !updateDeferred ? (
          <UpdateReadyToast />
        ) : offlineReady ? (
          <OfflineToast />
        ) : null}
      </div>
    </div>
  );
};
