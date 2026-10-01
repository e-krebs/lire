import { createFileRoute, Outlet, useChildMatches } from "@tanstack/react-router";
import { fromStreamKey } from "shared/feedsApi/streamKey";
import { isReadStreamId } from "shared/feedsApi/streams";
import { useProfile } from "client/api/queries";
import { Panes } from "client/components/shell/AppShell";
import { MosaicGrid, MosaicSkeleton } from "client/components/articles/MosaicGrid";

type Ranked = "newest" | "oldest";

export interface StreamSearch {
  unread?: boolean;
  ranked?: Ranked;
  // Article search within the stream (feeds API /v3/search/contents); absent = plain stream.
  q?: string;
}

export const Route = createFileRoute("/stream/$streamKey")({
  validateSearch: (search: Record<string, unknown>): StreamSearch => ({
    unread: typeof search.unread === "boolean" ? search.unread : undefined,
    ranked: search.ranked === "oldest" ? "oldest" : undefined,
    q: typeof search.q === "string" && search.q.trim() !== "" ? search.q : undefined,
  }),
  component: StreamLayout,
});

function StreamLayout() {
  const { streamKey } = Route.useParams();
  const search = Route.useSearch();
  const profile = useProfile();
  const childMatches = useChildMatches();

  // The key carries no user id, so the full stream id waits on the profile.
  const userId = profile.data?.id;
  // Same panes as the loaded state, so the scroll pane (and its bar) is there from the first frame.
  if (userId === undefined) {
    return <Panes list={<MosaicSkeleton />} reader={null} />;
  }

  const streamId = fromStreamKey({ key: streamKey, userId });
  // The recently-read stream is read entries by definition.
  const unreadOnly = isReadStreamId(streamId) ? false : (search.unread ?? true);
  const ranked = search.ranked ?? "newest";
  const readerOpen = childMatches.length > 0;

  return (
    <Panes
      list={
        <MosaicGrid
          streamId={streamId}
          unreadOnly={unreadOnly}
          ranked={ranked}
          query={search.q}
          readerOpen={readerOpen}
        />
      }
      reader={readerOpen ? <Outlet /> : null}
    />
  );
}
