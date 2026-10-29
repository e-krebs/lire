import { Link, useParams } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { toStreamKey } from "shared/feedsApi/streamKey";
import type { Entry } from "shared/feedsApi/types";
import { feedHue } from "client/utils/feedHue";
import { decodeEntities } from "client/utils/html";
import { Icon } from "client/components/primitives/icons/icons";
import { useLocale } from "client/i18n/locale";
import { useT } from "client/i18n/useT";
import { absoluteTime, mediumDate } from "client/utils/time";
import { tip } from "client/utils/tooltip";

interface ReaderHeaderProps {
  entry: Entry;
  /** The feed's name, from the feeds the caller already holds. */
  originTitle: string;
  /** Estimated reading time in minutes; 0 when the body is too short to bother. */
  minutes: number;
  /** State the panel opened in, so optimistic flips keep the labels; undefined until resolved. */
  openedUnread: boolean | undefined;
  /** Keep button clicked: leave the entry's read state as it was. */
  onKeep: () => void;
  /** Mark button clicked: flip the entry's read state. */
  onMark: () => void;
}

const BUTTON_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2";

// Two rows: the feed masthead with the date and the two exits, then the title as the link to the
// original. Sticky inside the panel's one scroll pane.
export const ReaderHeader = ({
  entry,
  originTitle,
  minutes,
  openedUnread,
  onKeep,
  onMark,
}: ReaderHeaderProps) => {
  const t = useT();
  const title = entry.title ? decodeEntities(entry.title) : t.articles.untitled;
  const openStreamKey = useParams({ strict: false }).streamKey;
  const feedKey = toStreamKey({ kind: "feed", feedId: entry.feedId });
  const href = entry.url;
  const timestamp = entry.published;
  const locale = useLocale();
  const openedRead = openedUnread === false;
  const keepIcon = openedRead ? "check" : "unread-only";
  const markIcon = openedRead ? "unread-only" : "check";
  // The custom property feeds the masthead colours in styles.css, the same recipe as the tile's.
  const hueStyle: CSSProperties & { "--hue": string } = {
    "--hue": String(feedHue(entry.feedId)),
  };

  return (
    <>
      <div style={hueStyle} className="reader-head min-w-0">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            {openStreamKey === feedKey ? (
              <span data-tip={originTitle} data-tip-overflow="" className="reader-feed-name">
                {originTitle}
              </span>
            ) : (
              <Link
                to="/stream/$streamKey"
                params={{ streamKey: feedKey }}
                search={{}}
                aria-label={t.articles.openFeed({ title: originTitle })}
                data-tip={originTitle}
                data-tip-overflow=""
                className="reader-feed-name hover:underline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {originTitle}
              </Link>
            )}
            <span aria-hidden="true" className="reader-feed-rule" />
          </span>
          <span className="reader-meta">
            <time
              dateTime={new Date(timestamp).toISOString()}
              data-tip={absoluteTime({ timestamp, locale })}
            >
              {mediumDate({ timestamp, locale })}
            </time>
            {minutes > 0 ? ` · ${t.articles.readingTime({ minutes })}` : ""}
          </span>
          <span className="flex flex-none items-center gap-2">
            <button
              type="button"
              {...tip({ label: openedRead ? t.articles.keepRead : t.articles.keepUnread })}
              onClick={onKeep}
              className={`reader-btn ${BUTTON_FOCUS} focus-visible:outline-accent`}
            >
              <Icon name={keepIcon} />
            </button>
            <button
              type="button"
              data-accent=""
              {...tip({ label: openedRead ? t.articles.markAsUnread : t.articles.markAsRead })}
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
