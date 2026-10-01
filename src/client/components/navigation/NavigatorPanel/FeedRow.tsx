import type { Subscription } from "shared/feedsApi/types";
import { EditLink } from "./EditLink";
import { highlightMatch } from "./highlightMatch";
import {
  countBadgeClassName,
  enterHintClassName,
  rowButtonClassName,
  rowClassName,
} from "./shared";

interface FeedRowProps {
  subscription: Subscription;
  /** Unread count in the badge. */
  count: number;
  /** The feed is the stream currently open. */
  isCurrent: boolean;
  /** Keyboard-highlighted row, activated by Enter. */
  selected?: boolean;
  /** Text to highlight in the title. */
  matchQuery?: string;
  /** Row clicked. */
  onSelect: () => void;
  /** Panel should close, once the edit link is followed. */
  onClose: () => void;
}

export const FeedRow = ({
  subscription,
  count,
  isCurrent,
  selected,
  matchQuery,
  onSelect,
  onClose,
}: FeedRowProps) => (
  <div
    data-current={isCurrent || undefined}
    data-selected={selected || undefined}
    className={`group ${rowClassName}`}
  >
    <button type="button" onClick={onSelect} className={rowButtonClassName}>
      <span
        aria-hidden="true"
        className="flex size-6 flex-none items-center justify-center rounded-full bg-accent-soft text-[0.65rem] font-bold text-accent-text"
      >
        {subscription.title.charAt(0).toUpperCase() || "?"}
      </span>
      <span
        data-tip={subscription.title}
        data-tip-overflow=""
        className={`
          min-w-0 flex-1 truncate text-sm font-medium text-ink
          group-data-current:font-semibold group-data-current:text-accent-text
        `}
      >
        {matchQuery
          ? highlightMatch({ text: subscription.title, query: matchQuery })
          : subscription.title}
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
    <EditLink
      target={{ kind: "feed", feedId: subscription.id }}
      title={subscription.title}
      onClose={onClose}
    />
  </div>
);
