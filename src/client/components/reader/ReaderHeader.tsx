import { useEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { Entry } from "shared/feedsApi/types";
import { feedHue } from "client/utils/feedHue";
import { Icon } from "client/components/ui/icons";
import { absoluteTime, mediumDate } from "client/utils/time";
import { tip } from "client/utils/tooltip";

interface ReaderHeaderProps {
  entry: Entry;
  /** Estimated reading time in minutes; 0 when the body is too short to bother. */
  minutes: number;
  /** State the panel opened in, so optimistic flips keep the labels; undefined until resolved. */
  openedUnread: boolean | undefined;
  /** The scroll pane this header sticks inside — the observer root for the condense sentinel. */
  paneRef: RefObject<HTMLDivElement | null>;
  /** Keep button clicked: leave the entry's read state as it was. */
  onKeep: () => void;
  /** Mark button clicked: flip the entry's read state. */
  onMark: () => void;
}

const BUTTON_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2";

// Two rows: the feed masthead with the date and the two exits, then the title as the link to the
// original. Sticky inside the panel's one scroll pane, so the sentinel above it — which a sticky
// element cannot be itself — is what reports the scrolled state.
export const ReaderHeader = ({
  entry,
  minutes,
  openedUnread,
  paneRef,
  onKeep,
  onMark,
}: ReaderHeaderProps) => {
  const [condensed, setCondensed] = useState(false);
  // A callback ref: the header mounts after the "Loading…" placeholder, so a RefObject set on the
  // first render would never re-arm.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = paneRef.current;
    if (!sentinel || !root || typeof IntersectionObserver === "undefined") return undefined;
    // Two thresholds, with the state kept in between: condensing shrinks the title, which on a
    // short article shortens the pane enough to clamp the scroll back over the sentinel, and a
    // single edge then flipped the header in a loop. Expanding waits for the very top.
    const observer = new IntersectionObserver(
      (records) => {
        const last = records.at(-1);
        if (!last) return;
        if (last.intersectionRatio >= 1) setCondensed(false);
        else if (!last.isIntersecting) setCondensed(true);
      },
      { root, threshold: [0, 1] },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [paneRef, sentinel]);

  const originTitle = entry.origin.title ?? entry.origin.streamId;
  const title = entry.title ?? "(untitled)";
  const href = entry.alternate?.[0]?.href;
  const timestamp = entry.published ?? entry.crawled;
  const openedRead = openedUnread === false;
  const keepIcon = openedRead ? "check" : "unread-only";
  const markIcon = openedRead ? "unread-only" : "check";
  // The custom property feeds the masthead colours in styles.css, the same recipe as the tile's.
  const hueStyle: CSSProperties & { "--hue": string } = {
    "--hue": String(feedHue(entry.origin.streamId)),
  };

  return (
    <>
      <div ref={setSentinel} aria-hidden="true" className="reader-sentinel" />
      <div
        style={hueStyle}
        data-condensed={condensed ? "" : undefined}
        className="reader-head min-w-0"
      >
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span data-tip={originTitle} data-tip-overflow="" className="reader-feed-name">
              {originTitle}
            </span>
            <span aria-hidden="true" className="reader-feed-rule" />
          </span>
          <span className="reader-meta">
            <time dateTime={new Date(timestamp).toISOString()} data-tip={absoluteTime(timestamp)}>
              {mediumDate(timestamp)}
            </time>
            {minutes > 0 ? ` · ${minutes} min` : ""}
          </span>
          <span className="flex flex-none items-center gap-2">
            <button
              type="button"
              {...tip({ label: openedRead ? "Keep read" : "Keep unread" })}
              onClick={onKeep}
              className={`reader-btn ${BUTTON_FOCUS} focus-visible:outline-accent`}
            >
              <Icon name={keepIcon} />
            </button>
            <button
              type="button"
              data-accent=""
              {...tip({ label: openedRead ? "Mark as unread" : "Mark as read" })}
              onClick={onMark}
              className={`reader-btn ${BUTTON_FOCUS} focus-visible:outline-ink`}
            >
              <Icon name={markIcon} />
            </button>
          </span>
        </div>
        <h1 className="reader-title-row">
          {href === undefined ? (
            <span className="reader-title">{title}</span>
          ) : (
            <a href={href} target="_blank" rel="noopener" className="reader-title">
              {title}
              <span aria-hidden="true" className="reader-arrow">
                ↗
              </span>
            </a>
          )}
        </h1>
      </div>
    </>
  );
};
