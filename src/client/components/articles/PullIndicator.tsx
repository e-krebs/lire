import type { CSSProperties } from "react";
import { Icon } from "client/components/ui/icons";
import { PULL_THRESHOLD } from "client/hooks/usePullToRefresh";
import type { PullState } from "client/hooks/usePullToRefresh";

interface PullIndicatorProps {
  pull: PullState | null;
}

// The disc the finger drags: silent while it is only a gesture, a status once the request is out.
export const PullIndicator = ({ pull }: PullIndicatorProps) => {
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
      {pull.refreshing ? <span className="sr-only">Refreshing</span> : null}
    </div>
  );
};
