import type { CSSProperties } from "react";
import { Icon } from "client/components/ui/icons";
import { useT } from "client/i18n/useT";
import { PULL_THRESHOLD } from "client/hooks/usePullToRefresh";
import type { PullState } from "client/hooks/usePullToRefresh";

interface PullIndicatorProps {
  pull: PullState | null;
}

// The disc the finger drags: silent while it is only a gesture, a status once the request is out.
export const PullIndicator = ({ pull }: PullIndicatorProps) => {
  const t = useT();
  if (!pull) return null;
  // The custom properties drive position and icon rotation from styles.css; typed as an
  // intersection, since React's CSSProperties has no index for `--*` keys.
  const pullStyle: CSSProperties & { "--pull": string; "--pull-turn": string } = {
    "--pull": `${pull.distance}px`,
    "--pull-turn": `${Math.min(pull.distance / PULL_THRESHOLD, 1) * 0.5}turn`,
  };

  return (
    <div
      aria-hidden={pull.refreshing ? undefined : true}
      role={pull.refreshing ? "status" : undefined}
      className="pull-indicator"
      data-edge={pull.edge}
      data-armed={pull.armed || undefined}
      data-refreshing={pull.refreshing || undefined}
      data-released={pull.released || undefined}
      style={pullStyle}
    >
      <Icon name="refresh" className="size-5" />
      {pull.refreshing ? <span className="sr-only">{t.articles.refreshingStatus}</span> : null}
    </div>
  );
};

interface PullActionProps {
  pull: PullState | null;
  /** The read state the pull's commit sets. */
  read: boolean;
}

// The reader's bottom pull: a band that rises under the article, tinted to the swipe's butter as
// it nears the threshold, naming the exit it will take. Gesture-only, so hidden from the tree:
// the header's Mark button is the same action for everyone else.
export const PullAction = ({ pull, read }: PullActionProps) => {
  const t = useT();
  if (!pull) return null;
  const pullStyle: CSSProperties & { "--pull": string; "--reveal": string } = {
    "--pull": `${pull.distance}px`,
    "--reveal": String(Math.min(pull.distance / PULL_THRESHOLD, 1)),
  };

  return (
    <div
      aria-hidden="true"
      className="pull-action"
      data-armed={pull.armed || undefined}
      data-released={pull.released || undefined}
      style={pullStyle}
    >
      <span className="pull-action-indicator">
        <Icon name={read ? "check" : "unread-only"} className="size-5" />
        {read ? t.articles.markReadAndClose : t.articles.markUnreadAndClose}
      </span>
    </div>
  );
};
