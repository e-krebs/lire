import type { Collection } from "shared/feedsApi/types";
import { EditLink } from "./EditLink";
import { highlightMatch } from "./highlightMatch";
import {
  countBadgeClassName,
  enterHintClassName,
  rowButtonClassName,
  rowClassName,
} from "./shared";

interface CategoryResultRowProps {
  collection: Collection;
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
  collection,
  count,
  isCurrent,
  selected,
  matchQuery,
  onSelect,
  onClose,
}: CategoryResultRowProps) => (
  <div
    data-current={isCurrent || undefined}
    data-selected={selected || undefined}
    className={rowClassName}
  >
    <button type="button" onClick={onSelect} className={rowButtonClassName}>
      <span
        data-tip={collection.label}
        data-tip-overflow=""
        className="min-w-0 flex-1 truncate text-sm font-bold text-ink"
      >
        {highlightMatch({ text: collection.label, query: matchQuery })}
      </span>
      {count > 0 ? (
        <span aria-hidden="true" className={countBadgeClassName}>
          {count}
        </span>
      ) : null}
      {selected ? (
        <span aria-hidden="true" className={enterHintClassName}>
          ↵
        </span>
      ) : null}
    </button>
    <EditLink
      target={{ kind: "category", categoryId: collection.id }}
      title={collection.label}
      onClose={onClose}
    />
  </div>
);
