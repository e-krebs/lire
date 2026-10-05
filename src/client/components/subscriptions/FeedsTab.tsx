import { useId, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useT } from "client/i18n/useT";
import { tip } from "client/utils/tooltip";
import { feedHue } from "client/utils/feedHue";
import { Icon } from "client/components/ui/icons";
import type { Category, Feed } from "shared/feedsApi/types";
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

const iconButtonClassName = `
  inline-flex size-11 flex-none items-center justify-center gap-px rounded-full bg-accent-soft
  text-accent-text
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
  /** All feeds to list. */
  feeds: Feed[];
  /** All categories, for the category filter and the panel. */
  categories: Category[];
  /** Feed whose panel is open, if any. */
  openFeedId: string | undefined;
  /** Feed row clicked. */
  onOpenFeed: (feedId: string) => void;
  /** "Add website" button clicked. */
  onAddWebsite: () => void;
  /** "Add newsletter" button clicked. */
  onAddNewsletter: () => void;
}

export const FeedsTab = ({
  feeds,
  categories,
  openFeedId,
  onOpenFeed,
  onAddWebsite,
  onAddNewsletter,
}: FeedsTabProps) => {
  const t = useT().subscriptions;
  const [filter, setFilter] = useState("");
  const labelOf = new Map(categories.map((category) => [category.id, category.label]));
  const rowId = useId();
  const shown = feeds.filter((feed) =>
    matchesFilter({ filter, texts: [feed.title, feed.siteUrl] }),
  );
  const shared = feeds.filter((feed) => feed.categoryIds.length > 1).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <FilterRow
          label={t.filterFeeds}
          placeholder={t.filterFeedsPlaceholder}
          value={filter}
          onChange={setFilter}
        />
        <button
          type="button"
          {...tip({ label: t.addWebsite })}
          onClick={onAddWebsite}
          className={iconButtonClassName}
        >
          <Icon name="website" className="size-5" />
          <Icon name="plus" className="size-3.5" />
        </button>
        <button
          type="button"
          {...tip({ label: t.addNewsletter })}
          onClick={onAddNewsletter}
          className={iconButtonClassName}
        >
          <Icon name="newsletter" className="size-5" />
          <Icon name="plus" className="size-3.5" />
        </button>
      </div>
      {/* Per-category counts never add up to the total, since a feed can sit in several. */}
      <p className="px-3 text-xs text-faint tabular-nums">
        {t.feedsSummary({ count: feeds.length, shared })}
      </p>
      {feeds.length === 0 ? (
        <EmptyLine>{t.noFeeds}</EmptyLine>
      ) : shown.length === 0 ? (
        <EmptyLine>{t.noFeedMatches({ query: filter.trim() })}</EmptyLine>
      ) : (
        <ul className="flex flex-col">
          {shown.map((feed, index) => {
            const host = hostOf(feed.siteUrl);
            const hostId = `${rowId}-host-${index}`;
            const chipsId = `${rowId}-chips-${index}`;
            return (
              <li key={feed.id}>
                <button
                  type="button"
                  data-selected={feed.id === openFeedId || undefined}
                  aria-current={feed.id === openFeedId || undefined}
                  aria-label={feed.title}
                  aria-describedby={[host === undefined ? null : hostId, chipsId]
                    .filter((id) => id !== null)
                    .join(" ")}
                  onClick={(event) => {
                    markPanelOrigin(event.currentTarget);
                    onOpenFeed(feed.id);
                  }}
                  className={listRowClassName}
                >
                  <HueDot feedId={feed.id} />
                  <span className="flex min-w-0 flex-1 flex-col sm:w-52 sm:flex-none">
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
                  <span id={chipsId} className="contents">
                    <ChipSet
                      labels={feed.categoryIds.map((id) => labelOf.get(id) ?? id)}
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
