import { useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useT } from "client/i18n/useT";
import { feedHue } from "client/utils/feedHue";
import { Icon } from "client/components/ui/icons";
import type { Collection, Subscription } from "shared/feedsApi/types";
import { AddSourcesMenu } from "./AddSourcesMenu";
import { ChipSet } from "./ChipSet";
import { markPanelOrigin } from "./SidePanel";

interface FilterRowProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

// The same filter row as CategoryPicker's, on its own.
export const FilterRow = ({ label, placeholder, value, onChange }: FilterRowProps) => (
  <div
    className={`
      flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface px-4 ring-1
      ring-hairline ring-inset
      focus-within:outline-2 focus-within:outline-accent
    `}
  >
    <Icon name="search" className="size-4 flex-none text-faint" />
    <input
      type="search"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      className={`
        min-w-0 flex-1 bg-transparent text-sm text-ink outline-none
        placeholder:text-faint
        [&::-webkit-search-cancel-button]:appearance-none
      `}
    />
  </div>
);

export const addButtonClassName = `
  inline-flex min-h-11 flex-none items-center rounded-full bg-accent-soft px-4 text-sm
  font-semibold whitespace-nowrap text-accent-text
  hover:bg-accent-soft/70
  focus-visible:outline-2 focus-visible:outline-accent
  motion-safe:transition-colors
`;

export const listRowClassName = `
  flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left
  hover:bg-surface-2
  focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent
  data-selected:bg-accent-soft
`;

export const EmptyLine = ({ children }: { children: ReactNode }) => (
  <p className="px-3 py-4 text-sm text-muted text-pretty">{children}</p>
);

export const hostOf = (website: string | undefined): string | undefined => {
  if (website === undefined) return undefined;
  try {
    return new URL(website).hostname;
  } catch {
    return website;
  }
};

export const HueDot = ({ feedId }: { feedId: string }) => {
  const style: CSSProperties = { backgroundColor: `oklch(0.65 0.15 ${feedHue(feedId)})` };
  return (
    <span aria-hidden="true" style={style} className="morph-dot size-2.5 flex-none rounded-full" />
  );
};

export const matchesFilter = ({
  filter,
  texts,
}: {
  filter: string;
  texts: (string | undefined)[];
}) => {
  const needle = filter.trim().toLocaleLowerCase();
  return texts.some((value) => value?.toLocaleLowerCase().includes(needle));
};

interface FeedsTabProps {
  /** All subscriptions to list. */
  subscriptions: Subscription[];
  /** All categories, for the category filter and the panel. */
  collections: Collection[];
  /** Feed whose panel is open, if any. */
  openFeedId: string | undefined;
  /** Feed row clicked. */
  onOpenFeed: (feedId: string) => void;
  /** "Add website" menu item picked. */
  onAddWebsite: () => void;
  /** "Add newsletter" menu item picked. */
  onAddNewsletter: () => void;
}

export const FeedsTab = ({
  subscriptions,
  collections,
  openFeedId,
  onOpenFeed,
  onAddWebsite,
  onAddNewsletter,
}: FeedsTabProps) => {
  const t = useT().subscriptions;
  const [filter, setFilter] = useState("");
  const labelOf = new Map(collections.map((collection) => [collection.id, collection.label]));
  const rowId = useId();
  const shown = subscriptions.filter((subscription) =>
    matchesFilter({ filter, texts: [subscription.title, subscription.website] }),
  );
  const shared = subscriptions.filter((subscription) => subscription.categories.length > 1).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <FilterRow
          label={t.filterFeeds}
          placeholder={t.filterFeedsPlaceholder}
          value={filter}
          onChange={setFilter}
        />
        <AddSourcesMenu
          onAddWebsite={onAddWebsite}
          onAddNewsletter={onAddNewsletter}
          className={addButtonClassName}
        />
      </div>
      {/* Per-category counts never add up to the total, since a feed can sit in several. */}
      <p className="px-3 text-xs text-faint tabular-nums">
        {t.feedsSummary({ count: subscriptions.length, shared })}
      </p>
      {subscriptions.length === 0 ? (
        <EmptyLine>{t.noFeeds}</EmptyLine>
      ) : shown.length === 0 ? (
        <EmptyLine>{t.noFeedMatches({ query: filter.trim() })}</EmptyLine>
      ) : (
        <ul className="flex flex-col">
          {shown.map((subscription, index) => {
            const host = hostOf(subscription.website);
            const hostId = `${rowId}-host-${index}`;
            const chipsId = `${rowId}-chips-${index}`;
            return (
              <li key={subscription.id}>
                <button
                  type="button"
                  data-selected={subscription.id === openFeedId || undefined}
                  aria-current={subscription.id === openFeedId || undefined}
                  aria-label={subscription.title}
                  aria-describedby={[host === undefined ? null : hostId, chipsId]
                    .filter((id) => id !== null)
                    .join(" ")}
                  onClick={(event) => {
                    markPanelOrigin(event.currentTarget);
                    onOpenFeed(subscription.id);
                  }}
                  className={listRowClassName}
                >
                  <HueDot feedId={subscription.id} />
                  <span className="flex min-w-0 flex-1 flex-col sm:w-52 sm:flex-none">
                    <span
                      data-tip={subscription.title}
                      data-tip-overflow=""
                      className="morph-name max-w-full self-start truncate text-sm font-medium text-ink"
                    >
                      {subscription.title}
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
                  <span id={chipsId} className="contents">
                    <ChipSet
                      labels={subscription.categories.map(
                        (category) => labelOf.get(category.id) ?? category.label ?? category.id,
                      )}
                      className="flex-1 justify-end sm:justify-start"
                    />
                  </span>
                  <Icon name="chevron" className="size-4 flex-none text-faint" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
