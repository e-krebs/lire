import { useId, useRef, useState } from "react";
import {
  unreadCountFor,
  useCreateCollection,
  useSaveSubscription,
  useUnreadCounts,
  useUnsubscribe,
} from "client/api/queries";
import { Switch } from "client/components/ui/Switch";
import { useDirectOpen, useSetDirectOpen } from "client/hooks/useDirectOpen";
import type { Collection, Subscription } from "shared/feedsApi/types";
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

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

const lossesOf = ({ categories, unread }: { categories: number; unread: number }): string =>
  listFormat.format([
    "the feed",
    ...(categories === 0
      ? []
      : [categories === 1 ? "its category" : `its ${categories} categories`]),
    ...(unread === 0
      ? []
      : [unread === 1 ? "its unread article" : `its ${unread} unread articles`]),
  ]);

interface FeedPanelProps {
  /** The subscription being edited. */
  feed: Subscription;
  /** All categories, for the feed's category picker. */
  collections: Collection[];
  /** Panel dismissed, or the feed was saved or removed. */
  onClose: () => void;
}

export const FeedPanel = ({ feed, collections, onClose }: FeedPanelProps) => {
  const formId = useId();
  const titleId = useId();
  const titleErrorId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const savedIds = feed.categories.map((category) => category.id);
  const [draftFor, setDraftFor] = useState(feed.id);
  const [title, setTitle] = useState(feed.title);
  const [selected, setSelected] = useState(savedIds);
  const [titleEmpty, setTitleEmpty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const save = useSaveSubscription();
  const unsubscribe = useUnsubscribe();
  const createCollection = useCreateCollection();
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
    createCollection.reset();
  }

  const unreadCounts = useUnreadCounts();
  const directOpen = useDirectOpen(feed.id);
  const setDirectOpen = useSetDirectOpen();

  const clearing = selected.length === 0;
  const saveMessage = save.isError
    ? `Could not save this feed. ${save.error.message}`
    : createCollection.isError
      ? `Could not create that category. ${createCollection.error.message}`
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
        subtitle={hostOf(feed.website)}
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
                Unsubscribe…
              </button>
            )}
            <button
              type="submit"
              form={formId}
              disabled={save.isPending || unsubscribe.isPending}
              data-clearing={clearing || undefined}
              className={submitClassName}
            >
              {clearing ? "Unsubscribe…" : "Save changes"}
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
              Title
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
                Enter a title for this feed.
              </p>
            ) : null}
          </div>
          <CategoryPicker
            key={feed.id}
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
          <div className="flex min-h-11 items-center">
            <Switch
              checked={directOpen}
              onChange={(checked) => {
                setDirectOpen(feed.id, checked);
              }}
              className="w-full justify-between"
            >
              Opens on its site
            </Switch>
          </div>
          {clearing ? (
            <p className="text-xs text-faint">Clearing every box unsubscribes this feed.</p>
          ) : null}
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
        title={`Unsubscribe from ${feed.title}?`}
        confirmLabel="Unsubscribe"
        // A DELETE that lands before a pending save's POST would be undone by it.
        confirmDisabled={unsubscribe.isPending || save.isPending}
        busy={unsubscribe.isPending}
        extra={
          unsubscribe.isError ? (
            <p role="alert" className="text-sm text-danger">
              {`Could not unsubscribe. ${unsubscribe.error.message}`}
            </p>
          ) : undefined
        }
      >
        {`Lire drops ${lossesOf({
          categories: feed.categories.length,
          unread: unreadCountFor({ counts: unreadCounts.data, id: feed.id }),
        })}. Subscribing again starts from an empty history.`}
      </ConfirmDialog>
    </>
  );
};
