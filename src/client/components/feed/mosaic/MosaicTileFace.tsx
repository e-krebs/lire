/* oxlint-disable tailwindcss/prefer-scale-token -- px, not rem: textHeight.ts sizes the card from these */
import { Link } from "@tanstack/react-router";
import type { CSSProperties, MouseEvent } from "react";
import { toStreamKey } from "shared/feedsApi/streamKey";
import type { StreamKey } from "shared/feedsApi/streamKey";
import type { Entry } from "shared/feedsApi/types";
import { Icon } from "client/components/primitives/icons/icons";
import { useLocale } from "client/i18n/locale";
import { useT } from "client/i18n/useT";
import { feedHue } from "client/utils/feedHue";
import { absoluteTime, shortRelativeTime } from "client/utils/time";

const chipClassName = `
  z-10 inline-flex max-w-[calc(100%-3.25rem)] items-center gap-1.5
  rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-semibold text-ink
  group-data-read/tile:opacity-80
`;
const floatingChipClassName = `absolute top-2 left-2 ${chipClassName}`;
// A text card seats the pill in its own row (20px high), 16px above the feed row.
const rowChipClassName = `h-[20px] flex-none self-start mb-[16px] ${chipClassName}`;

const titleClassName = `
  tile-title pointer-events-auto line-clamp-3 text-xl/tight font-bold tracking-[-0.01em]
  decoration-2 underline-offset-2
  hover:underline
  focus-visible:outline-2 focus-visible:outline-accent
`;

// The masthead names the feed, so the chip carries the age alone.
const Chip = ({ entry, inFlow = false }: { entry: Entry; inFlow?: boolean }) => {
  const timestamp = entry.published;
  const locale = useLocale();
  // A preview entry has no date: 0 stands for none.
  if (timestamp === 0) return null;

  return (
    <span className={inFlow ? rowChipClassName : floatingChipClassName}>
      <time
        dateTime={new Date(timestamp).toISOString()}
        data-tip={absoluteTime({ timestamp, locale })}
        className="pointer-events-auto flex-none tabular-nums"
      >
        {shortRelativeTime({ timestamp, locale })}
      </time>
    </span>
  );
};

const feedLinkClassName = `
  tile-feed pointer-events-auto min-w-0 truncate
  hover:underline
  focus-visible:outline-2 focus-visible:outline-accent
`;

interface MastheadProps {
  feedId: string;
  /** The open stream: its own feed name stays plain text. Absent in the preview, which has no routes. */
  streamKey: StreamKey | undefined;
  originTitle: string;
  title: string;
  original: string | undefined;
  directOpen: boolean;
  tabIndex?: 0 | -1 | undefined;
  onFocus?: (() => void) | undefined;
  onTitleClick?: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
}

const Masthead = ({
  feedId,
  streamKey,
  originTitle,
  title,
  original,
  directOpen,
  tabIndex,
  onFocus,
  onTitleClick,
}: MastheadProps) => {
  const t = useT();
  const feedKey = toStreamKey({ kind: "feed", feedId });
  return (
    <>
      <span
        className={`
        tile-label flex items-center gap-1.5
        text-[11px]/[14px] font-bold tracking-[0.08em] uppercase
        group-not-data-has-image/tile:mt-auto
      `}
      >
        {streamKey === undefined || feedKey === streamKey ? (
          <span data-tip={originTitle} data-tip-overflow="" className="tile-feed min-w-0 truncate">
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
            tabIndex={-1}
            onClick={onTitleClick}
            className={feedLinkClassName}
          >
            {originTitle}
          </Link>
        )}
        {directOpen ? (
          <span
            aria-hidden="true"
            className={`
            inline-flex h-[14px] flex-none items-center rounded-full bg-accent px-1 text-on-accent
          `}
          >
            <Icon name="external" className="size-2.5" />
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={`
        tile-rule mt-1.5 mb-2 h-0.5 w-7 flex-none rounded-full
        group-not-data-has-image/tile:mt-[6px] group-not-data-has-image/tile:mb-[8px]
        group-not-data-has-image/tile:h-[2px]
      `}
      />
      {original === undefined ? (
        <span data-tip={title} data-tip-overflow="" className={titleClassName}>
          {title}
        </span>
      ) : (
        <a
          href={original}
          target="_blank"
          rel="noopener"
          aria-label={t.articles.opensOriginalInNewTab({ title })}
          data-tip={title}
          data-tip-overflow={directOpen ? t.articles.opensOnItsSite : t.articles.openTheOriginal}
          tabIndex={tabIndex}
          onFocus={onFocus}
          onClick={onTitleClick}
          className={titleClassName}
        >
          {title}
        </a>
      )}
    </>
  );
};

interface MosaicTileFaceProps {
  entry: Entry;
  originTitle: string;
  title: string;
  /** Absent in the preview: no route, so the feed name is plain text. */
  streamKey?: StreamKey | undefined;
  directOpen: boolean;
  image: { src: string | undefined; onError: () => void };
  /** Only the grid's cards are focusable; the preview passes none of the three. */
  tabIndex?: 0 | -1 | undefined;
  onFocus?: (() => void) | undefined;
  onTitleClick?: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
}

// The visuals of a tile, to sit inside a `group/tile` wrapper that carries `data-has-image`.
export const MosaicTileFace = ({
  entry,
  originTitle,
  title,
  streamKey,
  directOpen,
  image,
  tabIndex,
  onFocus,
  onTitleClick,
}: MosaicTileFaceProps) => {
  const hasImage = image.src !== undefined;
  const original = entry.url;
  // The custom property feeds every colour in styles.css; typed as an intersection, since
  // React's CSSProperties has no index for `--*` keys.
  const hueStyle: CSSProperties & { "--hue": string } = {
    "--hue": String(feedHue(entry.feedId)),
  };

  return (
    <span
      style={hueStyle}
      className={`
    tile-card pointer-events-none relative block size-full rounded-xl
    bg-surface-2
  `}
    >
      {hasImage ? (
        <img
          src={image.src}
          onError={image.onError}
          alt=""
          loading="lazy"
          decoding="async"
          className={`
        block size-full object-cover object-top
        group-data-read/tile:opacity-70 group-data-read/tile:grayscale
      `}
        />
      ) : null}
      <span
        className={`
      tile-glass flex
      flex-col
      group-not-data-has-image/tile:size-full
      group-not-data-has-image/tile:px-[12px] group-not-data-has-image/tile:pt-[8px]
      group-not-data-has-image/tile:pb-[14px]
    `}
      >
        {hasImage ? null : <Chip entry={entry} inFlow />}
        <Masthead
          feedId={entry.feedId}
          streamKey={streamKey}
          originTitle={originTitle}
          title={title}
          original={original}
          directOpen={directOpen}
          tabIndex={tabIndex}
          onFocus={onFocus}
          onTitleClick={onTitleClick}
        />
      </span>
      {hasImage ? <Chip entry={entry} /> : null}
    </span>
  );
};
