import { useEffect, useRef, useState } from "react";
import { useNewsletterAddress } from "client/api/queries";
import { useT } from "client/i18n/useT";
import { Icon } from "client/components/ui/icons";
import { primaryClassName } from "./CategoryPanel";
import { SidePanel } from "./SidePanel";

const secondaryClassName = `
  min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold text-ink
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  motion-safe:transition-colors
  disabled:opacity-50
`;

const COPIED_RESET_MS = 2000;

interface NewsletterPanelProps {
  /** Panel dismissed. */
  onClose: () => void;
}

export const NewsletterPanel = ({ onClose }: NewsletterPanelProps) => {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const address = useNewsletterAddress();

  const canCopy = (navigator as Partial<Navigator>).clipboard !== undefined;

  useEffect(
    () => () => {
      clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = (emailAddress: string): void => {
    navigator.clipboard.writeText(emailAddress).then(
      () => {
        clearTimeout(resetTimer.current);
        setCopied(true);
        resetTimer.current = setTimeout(() => {
          setCopied(false);
        }, COPIED_RESET_MS);
        setCopyError("");
      },
      () => {
        clearTimeout(resetTimer.current);
        setCopied(false);
        setCopyError(t.subscriptions.copyFailed);
      },
    );
  };

  return (
    <SidePanel
      open
      onClose={onClose}
      title={t.subscriptions.addNewsletterTitle}
      subtitle={t.subscriptions.newsletterSubtitle}
      actions={
        <button type="button" onClick={onClose} className={primaryClassName}>
          {t.common.close}
        </button>
      }
    >
      <div className="flex flex-col gap-4 px-4 py-4">
        <p className="text-sm text-muted text-pretty">{t.subscriptions.newsletterHelp}</p>
        {address.data === undefined ? (
          address.isError ? (
            <p role="alert" className="text-sm text-danger">
              {t.subscriptions.loadAddressFailed({ message: address.error.message })}
            </p>
          ) : (
            <p className="text-sm text-faint">{t.common.loading}</p>
          )
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm break-all text-ink select-all">
                {address.data.emailAddress}
              </span>
              {canCopy ? (
                <button
                  type="button"
                  onClick={() => {
                    copy(address.data.emailAddress);
                  }}
                  data-copied={copied || undefined}
                  className={`${secondaryClassName} copy-swap data-copied:text-accent-text`}
                >
                  <span className="copy-swap-label" aria-hidden={copied || undefined}>
                    {t.subscriptions.copy}
                  </span>
                  <span className="copy-swap-check" aria-hidden>
                    <Icon name="check" />
                  </span>
                  {copied ? <span className="sr-only">{t.subscriptions.copied}</span> : null}
                </button>
              ) : null}
            </div>
            <span role="status" className="text-xs text-faint">
              {copyError}
            </span>
          </div>
        )}
      </div>
    </SidePanel>
  );
};
