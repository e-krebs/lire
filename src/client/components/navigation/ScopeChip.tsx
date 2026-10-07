import type { MatchCount } from "client/api/queries";
import { Icon } from "client/components/ui/icons";
import { useT } from "client/i18n/useT";

interface ScopeChipProps {
  /** Name of the scope, e.g. a category or feed title. */
  label: string;
  /** Shown as "12", or "50+" when capped; undefined renders no badge. */
  count?: MatchCount | undefined;
  /** Set when the scope is narrower than All; the phone may pass it too. */
  onClear?: () => void;
  /** Drops the 40% cap and shrinks down to the badge and the ×, for the phone pill. */
  fluid?: boolean;
}

const chipClassName = `
  flex h-7 max-w-[40%] flex-none items-center gap-0.5 rounded-full bg-accent-soft pl-2.5 text-xs
  font-semibold text-accent-text
  pr-2.5 data-clearable:pr-0
  data-fluid:max-w-none data-fluid:flex-initial data-fluid:data-count:min-w-14
`;

// The stream the location bar points at, shown inside the search field. Clearing it widens both
// the view and the next search to every article.
export const ScopeChip = ({ label, count, onClear, fluid }: ScopeChipProps) => {
  const t = useT().navigation;
  return (
    <span
      data-clearable={onClear ? "" : undefined}
      data-fluid={fluid ? "" : undefined}
      data-count={count === undefined ? undefined : ""}
      className={chipClassName}
    >
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span data-tip={label} data-tip-overflow="" className="truncate">
          {label}
        </span>
        {count === undefined ? null : (
          <span
            className={`
              flex h-4 min-w-4 flex-none items-center justify-center rounded-full bg-accent px-1
              text-[0.6875rem] leading-none text-on-accent tabular-nums
            `}
          >
            <span aria-hidden="true">{count.capped ? `${count.count}+` : count.count}</span>
            <span className="sr-only">
              {count.capped
                ? t.matchCountOrMore({ count: count.count })
                : t.matchCount({ count: count.count })}
            </span>
          </span>
        )}
      </span>
      {onClear ? (
        <button
          type="button"
          aria-label={t.searchEverywhereInstead({ label })}
          data-tip={t.searchEverywhere}
          onClick={onClear}
          className={`
            relative -my-1.5 flex size-10 flex-none items-center justify-center rounded-full
            text-accent-text hover:text-ink
            focus-visible:outline-2 focus-visible:outline-accent
          `}
        >
          <Icon name="close" className="size-3.5" />
        </button>
      ) : null}
    </span>
  );
};
