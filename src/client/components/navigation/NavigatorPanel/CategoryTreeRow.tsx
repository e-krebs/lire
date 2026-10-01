import type { Collection } from "shared/feedsApi/types";
import { Icon } from "client/components/ui/icons";
import { EditLink } from "./EditLink";
import {
  countBadgeClassName,
  enterHintClassName,
  rowButtonClassName,
  rowClassName,
} from "./shared";

// Sits over the row button's left end, where the button leaves a 24px spacer for it. The hit
// area stays 40px; the hover disc is the 28px `after` inside it, so it keeps clear of the label.
const twistyClassName = `
  absolute top-1/2 left-0 isolate flex size-10 flex-none -translate-y-1/2 rotate-90 cursor-pointer
  items-center justify-center rounded-full text-muted
  transition-transform
  after:absolute after:inset-1.5 after:-z-10 after:rounded-full
  hover:after:bg-hairline
  focus-visible:outline-2 focus-visible:outline-accent
  data-collapsed:rotate-0
  motion-reduce:transition-none
`;

interface CategoryTreeRowProps {
  collection: Pick<Collection, "id" | "label">;
  /** Unread count in the badge. */
  count: number;
  /** The category is the stream currently open. */
  isCurrent: boolean;
  /** Its feeds are hidden. */
  collapsed: boolean;
  /** A category without feeds has nothing to open: the twisty gives way to blank space. */
  expandable: boolean;
  /** Keyboard-highlighted row, activated by Enter. */
  selected: boolean;
  /** Twisty clicked. */
  onToggleCollapse: () => void;
  /** Row clicked. */
  onSelect: () => void;
  /** Panel should close, once the edit link is followed. */
  onClose: () => void;
}

export const CategoryTreeRow = ({
  collection,
  count,
  isCurrent,
  collapsed,
  expandable,
  selected,
  onToggleCollapse,
  onSelect,
  onClose,
}: CategoryTreeRowProps) => (
  <div
    data-current={isCurrent || undefined}
    data-selected={selected || undefined}
    className={`group ${rowClassName}`}
  >
    <button type="button" onClick={onSelect} className={rowButtonClassName}>
      <span aria-hidden="true" className="size-6 flex-none" />
      <span
        data-tip={collection.label}
        data-tip-overflow=""
        className={`
          min-w-0 flex-1 truncate text-sm font-bold text-ink
          group-data-current:text-accent-text
        `}
      >
        {collection.label}
      </span>
      <span aria-hidden="true" className={countBadgeClassName}>
        {count}
      </span>
      {selected ? (
        <span aria-hidden="true" className={enterHintClassName}>
          ↵
        </span>
      ) : null}
    </button>
    {expandable ? (
      <button
        type="button"
        aria-label={`Toggle ${collection.label}`}
        aria-expanded={!collapsed}
        data-tip={collapsed ? "Expand" : "Collapse"}
        data-collapsed={collapsed || undefined}
        onClick={onToggleCollapse}
        className={twistyClassName}
      >
        <Icon name="chevron" className="size-4" />
      </button>
    ) : null}
    <EditLink
      target={{ kind: "category", categoryId: collection.id }}
      title={collection.label}
      onClose={onClose}
    />
  </div>
);
