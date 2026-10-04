import { useT } from "client/i18n/useT";
import { applyUpdate, dismiss, usePwaUpdate } from "client/utils/pwaUpdate";

const buttonClass = `
  min-h-11 rounded-full bg-surface-2 px-3 py-1 font-medium text-ink
  hover:bg-hairline
  focus-visible:outline-2 focus-visible:outline-accent
`;

export const UpdateToast = () => {
  const { shell } = useT();
  const { updateReady, offlineReady } = usePwaUpdate();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div role="status">
        {updateReady || offlineReady ? (
          <p className="pointer-events-auto flex items-center gap-3 rounded-full bg-accent-soft py-2 pr-2 pl-4 text-sm text-accent-text shadow-lg">
            {updateReady ? shell.updateReady : shell.offlineReady}
            {updateReady ? (
              <>
                <button type="button" onClick={() => void applyUpdate()} className={buttonClass}>
                  {shell.reload}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    dismiss({ kind: "update" });
                  }}
                  className={buttonClass}
                >
                  {shell.later}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  dismiss({ kind: "offline" });
                }}
                className={buttonClass}
              >
                {shell.dismiss}
              </button>
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
};
