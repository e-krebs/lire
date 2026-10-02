import type { StreamSearch } from "client/routes/stream.$streamKey";
import { Icon } from "client/components/ui/icons";
import { useT } from "client/i18n/useT";
import { tip } from "client/utils/tooltip";
import { setViewPrefs, useViewPrefs } from "client/utils/viewPrefs";

interface ViewTogglesProps {
  /** Current route search params, which hold the filter and sort state. */
  search: StreamSearch;
}

// 36px tall inside the location pill, radius 18px = the pill's 20px minus the group's 2px inset,
// so the corners stay concentric; `after:` grows the hit area back to the pill's own 40px.
const controlClassName = `
  relative inline-flex h-9 w-10 flex-none items-center justify-center rounded-[18px] text-muted
  transition-colors
  after:absolute after:inset-x-0 after:-inset-y-0.5
  focus-visible:outline-2 focus-visible:outline-accent
  not-aria-disabled:hover:bg-surface-2
  aria-disabled:cursor-default aria-disabled:text-faint
  aria-pressed:bg-accent-soft aria-pressed:text-accent-text
  aria-disabled:aria-pressed:bg-transparent aria-disabled:aria-pressed:text-faint
  motion-reduce:transition-none
`;

// The unread filter and the sort order as two direct toggles at the pill's right end: one tap
// each, and the icon itself carries the state so the fill is never the only signal.
export const ViewToggles = ({ search }: ViewTogglesProps) => {
  const t = useT().navigation;
  const prefs = useViewPrefs();

  // A search is always newest first. Clearing the search itself belongs to the location bar's
  // field, not here.
  const searching = search.q !== undefined;
  const unreadOnly = prefs.unread;
  const oldestFirst = prefs.ranked === "oldest";

  return (
    <div role="group" aria-label={t.viewGroup} className="flex h-9 flex-none items-center gap-0.5">
      <button
        type="button"
        aria-pressed={unreadOnly}
        {...tip({ label: t.unreadOnly })}
        data-tip={unreadOnly ? t.showAllArticles : t.showUnreadOnly}
        onClick={() => {
          setViewPrefs({ unread: !unreadOnly });
        }}
        className={controlClassName}
      >
        {unreadOnly ? (
          <Icon name="unread-only" className="size-5" />
        ) : (
          <Icon name="everything" className="size-5" />
        )}
      </button>
      <button
        type="button"
        aria-pressed={oldestFirst}
        aria-label={t.oldestFirst}
        data-tip={searching ? t.searchNewestFirst : oldestFirst ? t.newestFirst : t.oldestFirst}
        aria-disabled={searching || undefined}
        onClick={() => {
          if (searching) return;
          setViewPrefs({ ranked: oldestFirst ? "newest" : "oldest" });
        }}
        className={controlClassName}
      >
        {oldestFirst ? (
          <Icon name="sort-oldest" className="size-5" />
        ) : (
          <Icon name="sort-newest" className="size-5" />
        )}
      </button>
    </div>
  );
};

// Same footprint as the toggles while the profile is still loading, so the pill's right end and
// its divider don't pop in later.
export const ViewTogglesSkeleton = () => {
  const t = useT().navigation;
  return (
    <div
      role="group"
      aria-label={t.viewGroup}
      aria-busy="true"
      className="flex h-9 flex-none items-center gap-0.5"
    >
      {Array.from({ length: 2 }, (_, index) => (
        <span key={index} className="inline-flex h-9 w-10 items-center justify-center">
          <span
            aria-hidden="true"
            className="size-5 rounded-full bg-surface-2 motion-safe:animate-pulse"
          />
        </span>
      ))}
    </div>
  );
};
