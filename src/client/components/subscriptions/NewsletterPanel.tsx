import { useEffect, useId, useRef, useState } from "react";
import {
  useCreateCollection,
  useCreateNewsletterAddress,
  useSubscribeNewsletter,
} from "client/api/queries";
import { useT } from "client/i18n/useT";
import type { Collection } from "shared/feedsApi/types";
import { Icon } from "client/components/ui/icons";
import { CategoryPicker } from "./CategoryPicker";
import { primaryClassName } from "./CategoryPanel";
import { SidePanel } from "./SidePanel";

const cancelClassName = `
  min-h-11 flex-1 rounded-xl bg-surface-2 px-4 text-sm font-semibold text-ink
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  motion-safe:transition-colors
`;

const secondaryClassName = `
  min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold text-ink
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  motion-safe:transition-colors
  disabled:opacity-50
`;

const COPIED_RESET_MS = 2000;

interface NewsletterPanelProps {
  /** All categories, for the category picker. */
  collections: Collection[];
  /** The category the panel was opened from, ticked up front. */
  categoryId: string | undefined;
  /** Panel dismissed, or the newsletter was added. */
  onClose: () => void;
}

export const NewsletterPanel = ({ collections, categoryId, onClose }: NewsletterPanelProps) => {
  const t = useT();
  const formId = useId();
  const nameId = useId();
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [selected, setSelected] = useState(
    categoryId !== undefined && collections.some((collection) => collection.id === categoryId)
      ? [categoryId]
      : [],
  );
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const generate = useCreateNewsletterAddress();
  const subscribe = useSubscribeNewsletter();
  const createCollection = useCreateCollection();

  const address = generate.data;
  const canCopy = (navigator as Partial<Navigator>).clipboard !== undefined;
  const canSubscribe =
    address !== undefined && name.trim().length > 0 && selected.length > 0 && !subscribe.isPending;

  const errorLine = generate.isError
    ? t.subscriptions.createAddressFailed({ message: generate.error.message })
    : subscribe.isError
      ? t.subscriptions.subscribeNewsletterFailed({ message: subscribe.error.message })
      : createCollection.isError
        ? t.subscriptions.createCategoryFailed({ message: createCollection.error.message })
        : null;

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
      subtitle={
        address === undefined ? t.subscriptions.newsletterStep1 : t.subscriptions.newsletterStep2
      }
      actions={
        <>
          <button type="button" onClick={onClose} className={cancelClassName}>
            {t.common.cancel}
          </button>
          <button type="submit" form={formId} disabled={!canSubscribe} className={primaryClassName}>
            {t.subscriptions.subscribe}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4 px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubscribe) return;
          subscribe.mutate(
            { feedId: address.feedId, title: name.trim(), categoryIds: selected },
            { onSuccess: onClose },
          );
        }}
      >
        {address === undefined ? (
          <button
            type="button"
            disabled={generate.isPending}
            onClick={() => {
              clearTimeout(resetTimer.current);
              setCopied(false);
              setCopyError("");
              generate.mutate();
            }}
            className={secondaryClassName}
          >
            {t.subscriptions.generateAddress}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm break-all text-ink select-all">
                {address.emailAddress}
              </span>
              {canCopy ? (
                <button
                  type="button"
                  onClick={() => {
                    copy(address.emailAddress);
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
        {address === undefined ? null : (
          <div className="flex flex-col gap-2">
            <label htmlFor={nameId} className="text-xs font-semibold text-muted">
              {t.subscriptions.name}
            </label>
            <input
              id={nameId}
              type="text"
              autoComplete="off"
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              className={`
                min-h-11 w-full rounded-xl bg-surface px-3 text-sm text-ink ring-1 ring-hairline
                ring-inset
                focus-visible:outline-2 focus-visible:outline-accent
              `}
            />
          </div>
        )}
        <CategoryPicker
          categories={collections}
          selected={selected}
          onChange={setSelected}
          mode="multiple"
          onCreate={(label) => {
            createCollection.mutate(label, {
              onSuccess: (collection) => {
                setSelected((current) => [...current, collection.id]);
              },
            });
          }}
        />
        {errorLine === null ? null : (
          <p role="alert" className="text-sm text-danger">
            {errorLine}
          </p>
        )}
      </form>
    </SidePanel>
  );
};
