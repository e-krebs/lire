import type { Feed } from "shared/feedsApi/types";
import { BrowseRow } from "./BrowseRow";
import { highlightMatch } from "./highlightMatch";

interface FeedRowProps {
  feed: Feed;
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
  feed,
  count,
  isCurrent,
  selected,
  matchQuery,
  onSelect,
  onClose,
}: FeedRowProps) => (
  <BrowseRow
    isCurrent={isCurrent}
    selected={selected}
    count={count}
    onSelect={onSelect}
    leading={
      <span
        aria-hidden="true"
        className="flex size-6 flex-none items-center justify-center rounded-full bg-accent-soft text-[0.65rem] font-bold text-accent-text"
      >
        {feed.title.charAt(0).toUpperCase() || "?"}
      </span>
    }
    edit={{ target: { kind: "feed", feedId: feed.id }, title: feed.title, onClose }}
  >
    <span
      data-tip={feed.title}
      data-tip-overflow=""
      className={`
        min-w-0 flex-1 truncate text-sm font-medium text-ink
        group-data-current:font-semibold group-data-current:text-accent-text
      `}
    >
      {matchQuery ? highlightMatch({ text: feed.title, query: matchQuery }) : feed.title}
    </span>
  </BrowseRow>
);
