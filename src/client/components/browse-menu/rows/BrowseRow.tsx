import type { ComponentProps, ReactNode } from "react";
import { EditLink } from "./EditLink";
import {
  countBadgeClassName,
  enterHintClassName,
  rowButtonClassName,
  rowClassName,
} from "./shared";

interface BrowseRowProps {
  /** The stream currently open. */
  isCurrent?: boolean;
  /** Keyboard-highlighted row, activated by Enter. */
  selected?: boolean;
  /** Unread count in the badge. */
  count?: number;
  /** Row clicked. */
  onSelect: () => void;
  /** Edit link after the row, absent when the row has none. */
  edit?: ComponentProps<typeof EditLink>;
  /** Before the label. */
  leading?: ReactNode;
  /** Between the main button and the edit link. */
  aside?: ReactNode;
  /** The label. */
  children: ReactNode;
}

export const BrowseRow = ({
  isCurrent,
  selected,
  count = 0,
  onSelect,
  edit,
  leading,
  aside,
  children,
}: BrowseRowProps) => (
  <div
    data-current={isCurrent || undefined}
    data-selected={selected || undefined}
    className={rowClassName}
  >
    <button type="button" onClick={onSelect} className={rowButtonClassName}>
      {leading}
      {children}
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
    {aside}
    {edit ? <EditLink {...edit} /> : null}
  </div>
);
