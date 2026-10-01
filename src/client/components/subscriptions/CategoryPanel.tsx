import { useId, useRef, useState } from "react";
import { useRenameCollection, useSaveSubscription, useUnsubscribe } from "client/api/queries";
import { feedsInCategory, orphansOf } from "client/api/selectors";
import { Icon } from "client/components/ui/icons";
import { tip } from "client/utils/tooltip";
import type { Collection, Subscription } from "shared/feedsApi/types";
import { AddSourcesMenu } from "./AddSourcesMenu";
import { ChipSet } from "./ChipSet";
import { ConfirmDialog } from "./ConfirmDialog";
import { DeleteCategoryDialog } from "./DeleteCategoryDialog";
import {
  EmptyLine,
  FilterRow,
  HueDot,
  addButtonClassName,
  feedCountLabel,
  hostOf,
  listRowClassName,
  matchesFilter,
} from "./FeedsTab";
import { SidePanel, markPanelOrigin } from "./SidePanel";

const actionClassName = `
  min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  disabled:cursor-default disabled:opacity-50
  motion-safe:transition-colors
`;
export const primaryClassName = `${actionClassName} bg-accent text-on-accent not-disabled:hover:bg-accent/90`;
const dangerSoftClassName = `${actionClassName} bg-danger-soft text-danger`;

interface CategoryNameFormProps {
  formId: string;
  category: Collection;
  // Owned by the panel, which holds the delete back while a rename runs.
  rename: ReturnType<typeof useRenameCollection>;
  onSaved: () => void;
}

// Keeps the draft on blur and submit enabled; an empty name only marks the field invalid.
export const CategoryNameForm = ({ formId, category, rename, onSaved }: CategoryNameFormProps) => {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(category.label);
  const [empty, setEmpty] = useState(false);

  const message = empty
    ? "Enter a name for this category."
    : rename.isError
      ? `Could not rename this category. ${rename.error.message}`
      : null;

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const label = name.trim();
        if (label === "") {
          setEmpty(true);
          inputRef.current?.focus();
          return;
        }
        rename.mutate({ id: category.id, label }, { onSuccess: onSaved });
      }}
    >
      <label htmlFor={inputId} className="text-xs font-semibold text-muted">
        Name
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        autoComplete="off"
        enterKeyHint="done"
        value={name}
        aria-invalid={empty || undefined}
        aria-describedby={message === null ? undefined : errorId}
        onChange={(event) => {
          setName(event.target.value);
          setEmpty(false);
        }}
        className={`
          min-h-11 w-full rounded-xl bg-surface px-3 text-sm text-ink ring-1 ring-hairline
          ring-inset
          focus-visible:outline-2 focus-visible:outline-accent
          aria-invalid:ring-danger
        `}
      />
      {message === null ? null : (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
    </form>
  );
};

const LOCKED_TIP = "Its feeds have no other category to move to";

// The feeds API keeps no feed without a category, so the last one's feeds would have nowhere to go.
const isDeleteLocked = ({
  category,
  collections,
  subscriptions,
}: {
  category: Collection;
  collections: Collection[];
  subscriptions: Subscription[];
}): boolean =>
  collections.length === 1 &&
  feedsInCategory({ subscriptions, categoryId: category.id }).length > 0;

interface CategoryActionsProps {
  formId: string;
  category: Collection;
  collections: Collection[];
  subscriptions: Subscription[];
  // A rename's success closes the panel, which would drop the delete dialog mid-request. The
  // dialog is modal, so no rename starts while it is up.
  renaming: boolean;
  onDelete: () => void;
}

export const CategoryActions = ({
  formId,
  category,
  collections,
  subscriptions,
  renaming,
  onDelete,
}: CategoryActionsProps) => {
  const reasonId = useId();
  const locked = isDeleteLocked({ category, collections, subscriptions });

  return (
    <>
      {/* aria-disabled, not disabled: a disabled button gets no hover or focus for its tooltip. */}
      <button
        type="button"
        disabled={renaming}
        aria-disabled={locked || undefined}
        aria-describedby={locked ? reasonId : undefined}
        data-tip={locked ? LOCKED_TIP : undefined}
        data-tip-side={locked ? "top" : undefined}
        onClick={() => {
          if (!locked) onDelete();
        }}
        className={`${dangerSoftClassName} aria-disabled:cursor-default aria-disabled:opacity-50`}
      >
        Delete category…
      </button>
      {locked ? (
        <span id={reasonId} hidden>
          {LOCKED_TIP}
        </span>
      ) : null}
      <button type="submit" form={formId} className={primaryClassName}>
        Save changes
      </button>
    </>
  );
};

interface CategoryPanelProps {
  /** The category being edited. */
  category: Collection;
  /** All categories, for the delete's orphan target. */
  collections: Collection[];
  /** All subscriptions, to list this category's feeds. */
  subscriptions: Subscription[];
  /** Panel dismissed, or the category was renamed or deleted. */
  onClose: () => void;
  /** Feed row clicked. */
  onOpenFeed: (feedId: string) => void;
  /** "Add website" menu item picked. */
  onAddWebsite: () => void;
  /** "Add newsletter" menu item picked. */
  onAddNewsletter: () => void;
}

export const CategoryPanel = ({
  category,
  collections,
  subscriptions,
  onClose,
  onOpenFeed,
  onAddWebsite,
  onAddNewsletter,
}: CategoryPanelProps) => {
  const formId = useId();
  const feedsHeadingId = useId();
  const [filter, setFilter] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState<Subscription | undefined>(undefined);
  const save = useSaveSubscription();
  const unsubscribe = useUnsubscribe();
  const rename = useRenameCollection();

  const feeds = feedsInCategory({ subscriptions, categoryId: category.id });
  const orphans = orphansOf({ subscriptions, categoryId: category.id }).length;
  const shared = feeds.length - orphans;
  const feedCount = feedCountLabel(feeds.length);
  const rowId = useId();
  const shown = feeds.filter((feed) =>
    matchesFilter({ filter, texts: [feed.title, feed.website] }),
  );
  const labelOf = new Map(collections.map((collection) => [collection.id, collection.label]));

  const remove = (feed: Subscription): void => {
    const others = feed.categories.filter((entry) => entry.id !== category.id);
    if (others.length === 0) {
      unsubscribe.reset();
      setUnsubscribing(feed);
      return;
    }
    save.mutate({
      feedId: feed.id,
      title: feed.title,
      categoryIds: others.map((entry) => entry.id),
    });
  };

  return (
    <>
      <SidePanel
        open
        onClose={onClose}
        title={category.label}
        subtitle={
          <>
            <span className="morph-detail">{feedCount}</span>
            {shared === 0 ? null : <span>{` · ${shared} also in another category`}</span>}
          </>
        }
        actions={
          <CategoryActions
            formId={formId}
            category={category}
            collections={collections}
            subscriptions={subscriptions}
            renaming={rename.isPending}
            onDelete={() => {
              setDeleting(true);
            }}
          />
        }
      >
        <div className="flex flex-col gap-4 px-4 py-4">
          <CategoryNameForm formId={formId} category={category} rename={rename} onSaved={onClose} />
          <section aria-labelledby={feedsHeadingId} className="flex flex-col gap-2">
            <h3 id={feedsHeadingId} className="text-xs font-semibold text-muted tabular-nums">
              {`Feeds · ${feeds.length}`}
            </h3>
            <div className="flex gap-2">
              <FilterRow
                label={`Filter feeds in ${category.label}`}
                placeholder={`Filter ${feedCount}…`}
                value={filter}
                onChange={setFilter}
              />
              <AddSourcesMenu
                onAddWebsite={onAddWebsite}
                onAddNewsletter={onAddNewsletter}
                className={addButtonClassName}
              />
            </div>
            {shown.length === 0 ? (
              <EmptyLine>{`No feed matches “${filter.trim()}”`}</EmptyLine>
            ) : (
              <ul className="flex flex-col">
                {shown.map((feed, index) => {
                  const host = hostOf(feed.website);
                  const hostId = `${rowId}-host-${index}`;
                  const chipsId = `${rowId}-chips-${index}`;
                  const others = feed.categories
                    .filter((entry) => entry.id !== category.id)
                    .map((entry) => labelOf.get(entry.id) ?? entry.label ?? entry.id);
                  const removing = save.isPending && save.variables.feedId === feed.id;
                  return (
                    <li key={feed.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={feed.title}
                        aria-describedby={[
                          host === undefined ? null : hostId,
                          others.length === 0 ? null : chipsId,
                        ]
                          .filter((id) => id !== null)
                          .join(" ")}
                        onClick={(event) => {
                          markPanelOrigin(event.currentTarget);
                          onOpenFeed(feed.id);
                        }}
                        className={`${listRowClassName} min-w-0 flex-1`}
                      >
                        <HueDot feedId={feed.id} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            data-tip={feed.title}
                            data-tip-overflow=""
                            className="morph-name max-w-full self-start truncate text-sm font-medium text-ink"
                          >
                            {feed.title}
                          </span>
                          {host === undefined ? null : (
                            <span
                              id={hostId}
                              data-tip={host}
                              data-tip-overflow=""
                              className="morph-detail max-w-full self-start truncate text-xs text-faint"
                            >
                              {host}
                            </span>
                          )}
                        </span>
                        {others.length === 0 ? null : (
                          <span id={chipsId} className="contents">
                            <ChipSet labels={others} className="w-[45%] flex-none justify-end" />
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={removing}
                        {...tip({ label: `Remove ${feed.title} from ${category.label}` })}
                        onClick={() => {
                          remove(feed);
                        }}
                        className={`
                          flex size-11 flex-none items-center justify-center rounded-full
                          text-muted
                          hover:bg-surface-2 hover:text-ink
                          focus-visible:outline-2 focus-visible:outline-accent
                          disabled:opacity-50
                        `}
                      >
                        <Icon name="close" className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {save.isError ? (
              <p role="alert" className="text-sm text-danger">
                {`Could not remove that feed. ${save.error.message}`}
              </p>
            ) : null}
          </section>
          <p className="text-xs text-faint text-pretty">
            {orphans === 0 || isDeleteLocked({ category, collections, subscriptions })
              ? "✕ removes the feed from this category only."
              : `✕ removes the feed from this category only. Deleting the category asks where the ${orphans === 1 ? "feed" : `${orphans} feeds`} with no other category go.`}
          </p>
        </div>
      </SidePanel>
      <DeleteCategoryDialog
        open={deleting}
        category={category}
        collections={collections}
        subscriptions={subscriptions}
        onCancel={() => {
          setDeleting(false);
        }}
        onDeleted={() => {
          setDeleting(false);
          onClose();
        }}
      />
      <ConfirmDialog
        open={unsubscribing !== undefined}
        onCancel={() => {
          setUnsubscribing(undefined);
        }}
        onConfirm={() => {
          if (unsubscribing === undefined) return;
          unsubscribe.mutate(unsubscribing.id, {
            onSuccess: () => {
              setUnsubscribing(undefined);
            },
          });
        }}
        title={`Unsubscribe from ${unsubscribing?.title ?? "this feed"}?`}
        confirmLabel="Unsubscribe"
        confirmDisabled={unsubscribe.isPending}
        busy={unsubscribe.isPending}
        extra={
          unsubscribe.isError ? (
            <p role="alert" className="text-sm text-danger">
              {`Could not unsubscribe. ${unsubscribe.error.message}`}
            </p>
          ) : undefined
        }
      >
        {`${category.label} is its only category, so removing it unsubscribes the feed. Subscribing again starts from an empty history.`}
      </ConfirmDialog>
    </>
  );
};
