import { Link } from "@tanstack/react-router";
import type { StreamKey } from "shared/feedsApi/streamKey";
import { useT } from "client/i18n/useT";
import {
  MIN_SEARCH_LENGTH,
  entryListKey,
  pageCountFor,
  useSearchContents,
  useStream,
} from "client/api/queries";
import { useTier } from "client/hooks/useTier";
import { MosaicBody } from "./MosaicBody";
import { actionClassName } from "./shared";

interface MosaicGridProps {
  /** The stream to list. */
  streamKey: StreamKey;
  /** Hide entries already read. */
  unreadOnly: boolean;
  /** Date sort order. */
  ranked: "newest" | "oldest";
  /** Article search within the stream; `ranked` doesn't apply to search results. */
  query?: string;
  /** The R shortcut belongs to the results alone, so it sleeps while the reader is open. */
  readerOpen?: boolean;
}

// Searching swaps the stream query for `GET /api/search`. Both hooks always run, since a hook
// can't be conditional, and the one that isn't wanted stays disabled.
export const MosaicGrid = ({
  streamKey,
  unreadOnly,
  ranked,
  query = "",
  readerOpen = false,
}: MosaicGridProps) => {
  const t = useT();
  const searching = query.trim() !== "";
  const count = pageCountFor({ tier: useTier(), streamKey });
  const streamResult = useStream({
    streamKey,
    unreadOnly,
    order: ranked,
    count,
    enabled: !searching,
  });
  const searchResult = useSearchContents({
    streamKey,
    query,
    unreadOnly,
    count,
    enabled: searching,
  });

  // The search hook stays disabled below the minimum, so `isPending` would otherwise spin forever.
  if (searching && query.trim().length < MIN_SEARCH_LENGTH) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-sm text-muted">{t.articles.typeAtLeast({ min: MIN_SEARCH_LENGTH })}</p>
        <Link to="." search={(prev) => ({ ...prev, q: undefined })} className={actionClassName}>
          {t.articles.clearSearch}
        </Link>
      </div>
    );
  }

  const queryKey = entryListKey({ streamKey, unreadOnly, order: ranked, query, count });
  return (
    <MosaicBody
      key={JSON.stringify(queryKey)}
      streamKey={streamKey}
      unreadOnly={unreadOnly}
      result={searching ? searchResult : streamResult}
      queryKey={queryKey}
      readerOpen={readerOpen}
      searchQuery={searching ? query : undefined}
    />
  );
};
