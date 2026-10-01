import { Link } from "@tanstack/react-router";
import { MIN_SEARCH_LENGTH, keys, useSearchContents, useStream } from "client/api/queries";
import { MosaicBody } from "./MosaicBody";
import { actionClassName } from "./shared";

interface MosaicGridProps {
  /** Full id of the stream to list. */
  streamId: string;
  /** Hide entries already read. */
  unreadOnly: boolean;
  /** Date sort order. */
  ranked: "newest" | "oldest";
  /** Article search within the stream; `ranked` doesn't apply to search results. */
  query?: string;
  /** The R shortcut belongs to the results alone, so it sleeps while the reader is open. */
  readerOpen?: boolean;
}

// Searching swaps the stream query for /v3/search/contents. Both hooks always run, since a hook
// can't be conditional, and the one that isn't wanted stays disabled.
export const MosaicGrid = ({
  streamId,
  unreadOnly,
  ranked,
  query = "",
  readerOpen = false,
}: MosaicGridProps) => {
  const searching = query.trim() !== "";
  const streamResult = useStream({ streamId, unreadOnly, ranked, enabled: !searching });
  const searchResult = useSearchContents({ streamId, query, unreadOnly, enabled: searching });

  // The search hook stays disabled below the minimum, so `isPending` would otherwise spin forever.
  if (searching && query.trim().length < MIN_SEARCH_LENGTH) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-sm text-muted">
          Type at least {MIN_SEARCH_LENGTH} characters to search.
        </p>
        <Link to="." search={(prev) => ({ ...prev, q: undefined })} className={actionClassName}>
          Clear search
        </Link>
      </div>
    );
  }

  const queryKey = searching
    ? keys.search({ streamId, query, unreadOnly })
    : keys.stream({ streamId, unreadOnly, ranked });
  return (
    <MosaicBody
      key={JSON.stringify(queryKey)}
      streamId={streamId}
      unreadOnly={unreadOnly}
      result={searching ? searchResult : streamResult}
      queryKey={queryKey}
      readerOpen={readerOpen}
      searchQuery={searching ? query : undefined}
    />
  );
};
