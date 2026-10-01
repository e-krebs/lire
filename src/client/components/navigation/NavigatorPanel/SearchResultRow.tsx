import { Icon } from "client/components/ui/icons";
import { enterHintClassName, rowButtonClassName, rowClassName } from "./shared";

interface SearchResultRowProps {
  /** Search text typed in the field. */
  query: string;
  /** Display label of the stream the search is limited to. */
  scopeLabel: string;
  /** Keyboard-highlighted row, activated by Enter. */
  selected: boolean;
  /** Row clicked. */
  onSelect: () => void;
}

// First result for any plain query: hitting Enter straight away searches articles, so the
// feed/collection matches below stay one ArrowDown away.
export const SearchResultRow = ({
  query,
  scopeLabel,
  selected,
  onSelect,
}: SearchResultRowProps) => (
  <div data-selected={selected || undefined} className={rowClassName}>
    <button type="button" onClick={onSelect} className={rowButtonClassName}>
      <Icon name="search" className="size-4 flex-none text-faint" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">
          Search articles for “{query}”
        </span>
        <span className="block truncate text-xs text-muted">in {scopeLabel}</span>
      </span>
      {selected ? (
        <span aria-hidden="true" className={enterHintClassName}>
          ↵
        </span>
      ) : null}
    </button>
  </div>
);
