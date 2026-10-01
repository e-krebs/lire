import { Icon } from "client/components/ui/icons";

interface ScopeChipProps {
  /** Name of the scope, e.g. a category or feed title. */
  label: string;
  /** Omitted for the default scope and on the phone bar, where the pill is one button: no ×. */
  onClear?: () => void;
}

const chipClassName = `
  flex h-7 max-w-[40%] flex-none items-center gap-0.5 rounded-full bg-accent-soft pl-2.5 text-xs
  font-semibold text-accent-text
  pr-2.5 data-clearable:pr-0
`;

// The stream the location bar points at, shown inside the search field. Clearing it widens both
// the view and the next search to every article.
export const ScopeChip = ({ label, onClear }: ScopeChipProps) => (
  <span data-clearable={onClear ? "" : undefined} className={chipClassName}>
    <span data-tip={label} data-tip-overflow="" className="truncate">
      {label}
    </span>
    {onClear ? (
      <button
        type="button"
        aria-label={`Search everywhere instead of ${label}`}
        data-tip="Search everywhere"
        onClick={onClear}
        className={`
          -my-1.5 flex size-10 flex-none items-center justify-center rounded-full
          hover:text-ink
          focus-visible:outline-2 focus-visible:outline-accent
        `}
      >
        <Icon name="close" className="size-3.5" />
      </button>
    ) : null}
  </span>
);
