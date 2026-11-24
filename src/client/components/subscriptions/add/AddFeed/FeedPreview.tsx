import { useFeedPreview } from "client/api/queries";
import { MosaicTileFace } from "client/components/feed/mosaic/MosaicTileFace";
import { secondaryClassName } from "client/components/primitives/controls/buttonClassNames";
import { useElementWidth } from "client/hooks/useElementWidth";
import { useImageFallback } from "client/hooks/useImageFallback";
import { useT } from "client/i18n/useT";
import { decodeEntities } from "client/utils/html";
import { textCardHeight } from "client/utils/textHeight";
import type { Entry } from "shared/feedsApi/types";

const PREVIEW_COUNT = 2;
// Photo cards take the proportions of a grid tile.
const PHOTO_RATIO = 1.25;

interface PreviewTileProps {
  entry: Entry;
  originTitle: string;
}

const PreviewTile = ({ entry, originTitle }: PreviewTileProps) => {
  const t = useT();
  const { attach, width } = useElementWidth();
  const image = useImageFallback({ url: entry.imageUrl });
  const height =
    width === undefined
      ? 0
      : entry.imageUrl === undefined
        ? textCardHeight({ title: entry.title, untitled: t.articles.untitled, width })
        : Math.round(width * PHOTO_RATIO);

  return (
    <div inert aria-hidden="true" ref={attach} className="relative w-full" style={{ height }}>
      {width === undefined ? null : (
        <div
          data-preview=""
          data-has-image={image.src === undefined ? undefined : ""}
          className="group/tile absolute inset-0"
        >
          <MosaicTileFace
            entry={entry}
            originTitle={originTitle}
            title={entry.title ? decodeEntities(entry.title) : t.articles.untitled}
            directOpen={false}
            image={image}
          />
        </div>
      )}
    </div>
  );
};

interface FeedPreviewProps {
  feedUrl: string;
  originTitle: string;
}

export const FeedPreview = ({ feedUrl, originTitle }: FeedPreviewProps) => {
  const { subscriptions: t, common } = useT();
  const preview = useFeedPreview({ feedUrl });
  const entries = preview.data?.entries.slice(0, PREVIEW_COUNT) ?? [];

  return (
    <section aria-busy={preview.isPending} className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-muted">{t.latestEntries}</h3>
      {preview.isError ? (
        <div role="alert" className="flex items-center justify-between gap-3 text-sm text-faint">
          <span>{t.previewUnavailable}</span>
          <button
            type="button"
            onClick={() => {
              void preview.refetch();
            }}
            className={`${secondaryClassName} flex-none`}
          >
            {common.retry}
          </button>
        </div>
      ) : preview.isPending ? (
        <p role="status" className="text-sm text-faint">
          {common.loading}
        </p>
      ) : entries.length === 0 ? (
        <p role="status" className="text-sm text-faint">
          {t.noEntriesYet}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {entries.map((entry, index) => (
            <PreviewTile
              key={entry.url || index}
              originTitle={originTitle}
              entry={{
                id: `preview-${index}`,
                feedId: feedUrl,
                title: entry.title,
                summary: entry.summary,
                url: entry.url,
                imageUrl: entry.imageUrl,
                published: entry.publishedAt === undefined ? 0 : Date.parse(entry.publishedAt),
                unread: true,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
};
