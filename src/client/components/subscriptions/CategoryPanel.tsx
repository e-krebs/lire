import { useId, useRef, useState } from "react";
import { useRenameCategory, useUpdateFeed, useUnsubscribe } from "client/api/queries";
import { feedsInCategory, orphansOf } from "client/api/selectors";
import { Icon } from "client/components/ui/icons";
import { useT } from "client/i18n/useT";
import { tip } from "client/utils/tooltip";
import type { Category, Feed } from "shared/feedsApi/types";
import { AddSourcesMenu } from "./AddSourcesMenu";
import { ChipSet } from "./ChipSet";
import { ConfirmDialog } from "./ConfirmDialog";
import { DeleteCategoryDialog } from "./DeleteCategoryDialog";
import {
  EmptyLine,
  FilterRow,
  HueDot,
  addButtonClassName,
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
  category: Category;
  categories: Category[];
  // Owned by the panel, which holds the delete back while a rename runs.
  rename: ReturnType<typeof useRenameCategory>;
  onSaved: () => void;
}

// Keeps the draft on blur and submit enabled; an empty name only marks the field invalid.
export const CategoryNameForm = ({
  formId,
  category,
  categories,
  rename,
  onSaved,
}: CategoryNameFormProps) => {
  const t = useT().subscriptions;
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(category.label);
  const [empty, setEmpty] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  const message = empty
    ? t.enterCategoryNameForPanel
    : duplicate
      ? t.categoryExists
      : rename.isError
        ? t.renameFailed({ message: rename.error.message })
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
        if (categories.some((c) => c.id === label && c.id !== category.id)) {
          setDuplicate(true);
          inputRef.current?.focus();
          return;
        }
        rename.mutate({ categoryId: category.id, label }, { onSuccess: onSaved });
      }}
    >
      <label htmlFor={inputId} className="text-xs font-semibold text-muted">
        {t.name}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        autoComplete="off"
        enterKeyHint="done"
        value={name}
        aria-invalid={empty || duplicate || undefined}
        aria-describedby={message === null ? undefined : errorId}
        onChange={(event) => {
          setName(event.target.value);
          setEmpty(false);
          setDuplicate(false);
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

// The last category cannot go while it holds feeds: they would have nowhere to go.
const isDeleteLocked = ({
  category,
  categories,
  allFeeds,
}: {
  category: Category;
  categories: Category[];
  allFeeds: Feed[];
}): boolean =>
  categories.length === 1 &&
  feedsInCategory({ feeds: allFeeds, categoryId: category.id }).length > 0;

interface CategoryActionsProps {
  formId: string;
  category: Category;
  categories: Category[];
  allFeeds: Feed[];
  // A rename's success closes the panel, which would drop the delete dialog mid-request. The
  // dialog is modal, so no rename starts while it is up.
  renaming: boolean;
  onDelete: () => void;
}

export const CategoryActions = ({
  formId,
  category,
  categories,
  allFeeds,
  renaming,
  onDelete,
}: CategoryActionsProps) => {
  const t = useT().subscriptions;
  const reasonId = useId();
  const locked = isDeleteLocked({ category, categories, allFeeds });

  return (
    <>
      {/* aria-disabled, not disabled: a disabled button gets no hover or focus for its tooltip. */}
      <button
        type="button"
        disabled={renaming}
        aria-disabled={locked || undefined}
        aria-describedby={locked ? reasonId : undefined}
        data-tip={locked ? t.lockedTip : undefined}
        data-tip-side={locked ? "top" : undefined}
        onClick={() => {
          if (!locked) onDelete();
        }}
        className={`${dangerSoftClassName} aria-disabled:cursor-default aria-disabled:opacity-50`}
      >
        {t.deleteCategoryEllipsis}
      </button>
      {locked ? (
        <span id={reasonId} hidden>
          {t.lockedTip}
        </span>
      ) : null}
      <button type="submit" form={formId} className={primaryClassName}>
        {t.saveChanges}
      </button>
    </>
  );
};

interface CategoryPanelProps {
  /** The category being edited. */
  category: Category;
  /** All categories, for the delete's orphan target. */
  categories: Category[];
  /** All feeds, to list this category's feeds. */
  allFeeds: Feed[];
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
  categories,
  allFeeds,
  onClose,
  onOpenFeed,
  onAddWebsite,
  onAddNewsletter,
}: CategoryPanelProps) => {
  const t = useT().subscriptions;
  const formId = useId();
  const feedsHeadingId = useId();
  const [filter, setFilter] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState<Feed | undefined>(undefined);
  const save = useUpdateFeed();
  const unsubscribe = useUnsubscribe();
  const rename = useRenameCategory();

  const feeds = feedsInCategory({ feeds: allFeeds, categoryId: category.id });
  const orphans = orphansOf({ feeds: allFeeds, categoryId: category.id }).length;
  const shared = feeds.length - orphans;
  const feedCount = t.feedCount({ count: feeds.length });
  const rowId = useId();
  const shown = feeds.filter((feed) =>
    matchesFilter({ filter, texts: [feed.title, feed.siteUrl] }),
  );
  const labelOf = new Map(categories.map((entry) => [entry.id, entry.label]));

  const remove = (feed: Feed): void => {
    const others = feed.categoryIds.filter((id) => id !== category.id);
    if (others.length === 0) {
      unsubscribe.reset();
      setUnsubscribing(feed);
      return;
    }
    save.mutate({
      feedId: feed.id,
      title: feed.title,
      categoryIds: others,
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
            {shared === 0 ? null : <span>{t.alsoInAnother({ count: shared })}</span>}
          </>
        }
        actions={
          <CategoryActions
            formId={formId}
            category={category}
            categories={categories}
            allFeeds={allFeeds}
            renaming={rename.isPending}
            onDelete={() => {
              setDeleting(true);
            }}
          />
        }
      >
        <div className="flex flex-col gap-4 px-4 py-4">
          <CategoryNameForm
            formId={formId}
            category={category}
            categories={categories}
            rename={rename}
            onSaved={onClose}
          />
          <section aria-labelledby={feedsHeadingId} className="flex flex-col gap-2">
            <h3 id={feedsHeadingId} className="text-xs font-semibold text-muted tabular-nums">
              {t.feedsHeading({ count: feeds.length })}
            </h3>
            <div className="flex gap-2">
              <FilterRow
                label={t.filterFeedsIn({ label: category.label })}
                placeholder={t.filterPlaceholder({ feedCount })}
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
              <EmptyLine>{t.noFeedMatches({ query: filter.trim() })}</EmptyLine>
            ) : (
              <ul className="flex flex-col">
                {shown.map((feed, index) => {
                  const host = hostOf(feed.siteUrl);
                  const hostId = `${rowId}-host-${index}`;
                  const chipsId = `${rowId}-chips-${index}`;
                  const others = feed.categoryIds
                    .filter((id) => id !== category.id)
                    .map((id) => labelOf.get(id) ?? id);
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
                        {...tip({
                          label: t.removeFeed({ title: feed.title, label: category.label }),
                        })}
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
                {t.removeFeedFailed({ message: save.error.message })}
              </p>
            ) : null}
          </section>
          <p className="text-xs text-faint text-pretty">
            {orphans === 0 || isDeleteLocked({ category, categories, allFeeds })
              ? t.removeHint
              : t.removeHintOrphans({ count: orphans })}
          </p>
        </div>
      </SidePanel>
      <DeleteCategoryDialog
        open={deleting}
        category={category}
        categories={categories}
        allFeeds={allFeeds}
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
        title={t.unsubscribeTitle({ title: unsubscribing?.title ?? t.thisFeed })}
        confirmLabel={t.unsubscribe}
        confirmDisabled={unsubscribe.isPending}
        busy={unsubscribe.isPending}
        extra={
          unsubscribe.isError ? (
            <p role="alert" className="text-sm text-danger">
              {t.unsubscribeFailed({ message: unsubscribe.error.message })}
            </p>
          ) : undefined
        }
      >
        {t.onlyCategory({ label: category.label })}
      </ConfirmDialog>
    </>
  );
};
