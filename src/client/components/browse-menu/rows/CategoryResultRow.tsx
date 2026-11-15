import type { Category } from "shared/feedsApi/types";
import { BrowseRow } from "./BrowseRow";
import { highlightMatch } from "./highlightMatch";

interface CategoryResultRowProps {
  category: Category;
  /** Unread count in the badge. */
  count: number;
  /** The category is the stream currently open. */
  isCurrent: boolean;
  /** Keyboard-highlighted row, activated by Enter. */
  selected: boolean;
  /** Text to highlight in the label. */
  matchQuery: string;
  /** Row clicked. */
  onSelect: () => void;
  /** Panel should close, once the edit link is followed. */
  onClose: () => void;
}

export const CategoryResultRow = ({
  category,
  count,
  isCurrent,
  selected,
  matchQuery,
  onSelect,
  onClose,
}: CategoryResultRowProps) => (
  <BrowseRow
    isCurrent={isCurrent}
    selected={selected}
    count={count}
    onSelect={onSelect}
    edit={{
      target: { kind: "category", categoryId: category.id },
      title: category.label,
      onClose,
    }}
  >
    <span
      data-tip={category.label}
      data-tip-overflow=""
      className="min-w-0 flex-1 truncate text-sm font-bold text-ink"
    >
      {highlightMatch({ text: category.label, query: matchQuery })}
    </span>
  </BrowseRow>
);
