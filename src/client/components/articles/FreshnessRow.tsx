import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "client/components/ui/icons";
import { relativeTime } from "client/utils/time";

interface FreshnessRowProps {
  /** Epoch ms of the last successful fetch; undefined before the first one. */
  updatedAt: number | undefined;
  /** A refetch is in flight. */
  refreshing: boolean;
  /** Refresh button clicked. */
  onRefresh: () => void;
  /** Left side of the row: what the grid is showing. */
  children?: ReactNode;
}

const AGE_TICK_MS = 30_000;

// The age comes off a fixed timestamp, so nothing would re-render it on its own.
const useNow = (intervalMs: number): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
};

// Same pill vocabulary as the location bar's controls, 40px tall for the hit area.
const buttonClassName = `
  inline-flex h-10 items-center gap-1.5 rounded-full px-3 font-medium text-ink
  hover:bg-surface-2
  focus-visible:outline-2 focus-visible:outline-accent
`;

// The row above the results: what the grid is showing on the left, how fresh it is on the right.
export const FreshnessRow = ({ updatedAt, refreshing, onRefresh, children }: FreshnessRowProps) => {
  const now = useNow(AGE_TICK_MS);

  const status = refreshing
    ? "Refreshing…"
    : updatedAt === undefined
      ? ""
      : `Updated ${relativeTime(updatedAt, now)}`;

  return (
    <div className="flex min-h-10 items-center justify-between gap-3 px-3 pt-3 text-sm text-muted">
      {children ?? <span />}
      <div className="flex items-center gap-1">
        <span role="status" aria-live="polite" className="tabular-nums">
          {status}
        </span>
        {/* Clickable while refreshing on purpose: the refetch dedupes, and a control that
            disappears from under the pointer is worse than a no-op. */}
        <button
          type="button"
          data-tip="Refresh"
          aria-keyshortcuts="R"
          aria-busy={refreshing || undefined}
          onClick={onRefresh}
          className={`group ${buttonClassName}`}
        >
          <Icon name="refresh" className="size-4 group-aria-busy:motion-safe:animate-spin" />
          Refresh
        </button>
      </div>
    </div>
  );
};
