import { useId, useRef, useState } from "react";
import {
  unreadCountFor,
  useCreateCategory,
  useUpdateFeed,
  useCounts,
  useUnsubscribe,
} from "client/api/queries";
import { Switch } from "client/components/ui/Switch";
import { useDirectOpen, useSetDirectOpen } from "client/hooks/useDirectOpen";
import type { Locale } from "client/i18n/locale";
import { useLocale } from "client/i18n/locale";
import { useT } from "client/i18n/useT";
import { toStreamKey } from "shared/feedsApi/streamKey";
import type { Category, Feed } from "shared/feedsApi/types";
import { CategoryPicker } from "./CategoryPicker";
import { ConfirmDialog } from "./ConfirmDialog";
import { HueDot, hostOf } from "./FeedsTab";
import { SidePanel } from "./SidePanel";

const actionClassName = `
  min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  disabled:cursor-default disabled:opacity-50
  motion-safe:transition-colors
`;
const submitClassName = `${actionClassName} bg-accent text-on-accent not-disabled:hover:bg-accent/90 data-clearing:bg-danger data-clearing:text-surface data-clearing:not-disabled:hover:bg-danger/90`;
const dangerSoftClassName = `${actionClassName} bg-danger-soft text-danger`;

const listFormats = new Map<Locale, Intl.ListFormat>();

const listFormatFor = (locale: Locale): Intl.ListFormat => {
  let format = listFormats.get(locale);
  if (!format) {
    format = new Intl.ListFormat(locale, { type: "conjunction" });
    listFormats.set(locale, format);
  }
  return format;
};

const lossesOf = ({
  categories,
  unread,
  t,
  locale,
}: {
  categories: number;
  unread: number;
  t: ReturnType<typeof useT>["subscriptions"];
  locale: Locale;
}): string =>
  listFormatFor(locale).format([
    t.lossFeed,
    ...(categories === 0 ? [] : [t.lossCategories({ count: categories })]),
    ...(unread === 0 ? [] : [t.lossUnread({ count: unread })]),
  ]);

interface FeedPanelProps {
  /** The subscription being edited. */
  feed: Feed;
  /** All categories, for the feed's category picker. */
  categories: Category[];
  /** Panel dismissed, or the feed was saved or removed. */
  onClose: () => void;
}

export const FeedPanel = ({ feed, categories, onClose }: FeedPanelProps) => {
  const t = useT().subscriptions;
  const locale = useLocale();
  const formId = useId();
  const titleId = useId();
  const titleErrorId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const savedIds = feed.categoryIds;
  const [draftFor, setDraftFor] = useState(feed.id);
  const [title, setTitle] = useState(feed.title);
  const [selected, setSelected] = useState(savedIds);
  const [titleEmpty, setTitleEmpty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const save = useUpdateFeed();
  const unsubscribe = useUnsubscribe();
  const createCategory = useCreateCategory();
  // Another row opened while the panel stays up: the drafts follow the new feed. The resets
  // also detach a pending save or create, so its onSuccess cannot close or tick this draft.
  if (draftFor !== feed.id) {
    setDraftFor(feed.id);
    setTitle(feed.title);
    setSelected(savedIds);
    setTitleEmpty(false);
    setConfirming(false);
    save.reset();
    unsubscribe.reset();
    createCategory.reset();
  }

  const counts = useCounts();
  const directOpen = useDirectOpen(feed.id);
  const setDirectOpen = useSetDirectOpen();

  const clearing = selected.length === 0;
  const saveMessage = save.isError
    ? t.saveFeedFailed({ message: save.error.message })
    : createCategory.isError
      ? t.createCategoryFailed({ message: createCategory.error.message })
      : null;

  const handleSave = (): void => {
    const nextTitle = title.trim();
    if (nextTitle === "") {
      setTitleEmpty(true);
      titleRef.current?.focus();
      return;
    }
    if (clearing) {
      setConfirming(true);
      return;
    }
    save.mutate(
      { feedId: feed.id, title: nextTitle, categoryIds: selected },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <SidePanel
        open
        onClose={onClose}
        title={feed.title}
        subtitle={hostOf(feed.siteUrl)}
        leading={<HueDot feedId={feed.id} />}
        actions={
          <>
            {clearing ? null : (
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => {
                  setConfirming(true);
                }}
                className={dangerSoftClassName}
              >
                {t.unsubscribeEllipsis}
              </button>
            )}
            <button
              type="submit"
              form={formId}
              disabled={save.isPending || unsubscribe.isPending}
              data-clearing={clearing || undefined}
              className={submitClassName}
            >
              {clearing ? t.unsubscribeEllipsis : t.saveChanges}
            </button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          className="flex flex-col gap-4 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={titleId} className="text-xs font-semibold text-muted">
              {t.titleLabel}
            </label>
            <input
              ref={titleRef}
              id={titleId}
              type="text"
              autoComplete="off"
              enterKeyHint="done"
              value={title}
              aria-invalid={titleEmpty || undefined}
              aria-describedby={titleEmpty ? titleErrorId : undefined}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleEmpty(false);
              }}
              className={`
                min-h-11 w-full rounded-xl bg-surface px-3 text-sm text-ink ring-1 ring-hairline
                ring-inset
                focus-visible:outline-2 focus-visible:outline-accent
                aria-invalid:ring-danger
              `}
            />
            {titleEmpty ? (
              <p id={titleErrorId} role="alert" className="text-sm text-danger">
                {t.enterTitle}
              </p>
            ) : null}
          </div>
          <CategoryPicker
            key={feed.id}
            categories={categories}
            selected={selected}
            onChange={setSelected}
            mode="multiple"
            onCreate={(label) => {
              createCategory.mutate(label, {
                onSuccess: (created) => {
                  setSelected((current) => [...current, created.id]);
                },
              });
            }}
          />
          <div className="flex min-h-11 items-center">
            <Switch
              checked={directOpen}
              onChange={(checked) => {
                setDirectOpen(feed.id, checked);
              }}
              className="w-full justify-between"
            >
              {t.opensOnSite}
            </Switch>
          </div>
          {clearing ? <p className="text-xs text-faint">{t.clearingHint}</p> : null}
          {saveMessage === null ? null : (
            <p role="alert" className="text-sm text-danger">
              {saveMessage}
            </p>
          )}
        </form>
      </SidePanel>
      <ConfirmDialog
        open={confirming}
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          unsubscribe.mutate(feed.id, {
            onSuccess: () => {
              setConfirming(false);
              onClose();
            },
          });
        }}
        title={t.unsubscribeTitle({ title: feed.title })}
        confirmLabel={t.unsubscribe}
        // A DELETE that lands before a pending save's POST would be undone by it.
        confirmDisabled={unsubscribe.isPending || save.isPending}
        busy={unsubscribe.isPending}
        extra={
          unsubscribe.isError ? (
            <p role="alert" className="text-sm text-danger">
              {t.unsubscribeFailed({ message: unsubscribe.error.message })}
            </p>
          ) : undefined
        }
      >
        {t.unsubscribeBody({
          losses: lossesOf({
            categories: feed.categoryIds.length,
            unread: unreadCountFor({
              counts: counts.data,
              streamKey: toStreamKey({ kind: "feed", feedId: feed.id }),
            }),
            t,
            locale,
          }),
        })}
      </ConfirmDialog>
    </>
  );
};
