import { createFileRoute, Outlet, redirect, useChildMatches } from "@tanstack/react-router";
import { parseStreamKey, toStreamKey } from "shared/feedsApi/streamKey";
import { Panes } from "client/components/shell/AppShell";
import { MosaicGrid } from "client/components/articles/MosaicGrid";
import { useViewPrefs } from "client/utils/viewPrefs";

export interface StreamSearch {
  // Article search within the stream (`GET /api/search`); absent = plain stream.
  q?: string;
}

export const Route = createFileRoute("/stream/$streamKey")({
  validateSearch: (search: Record<string, unknown>): StreamSearch => ({
    q: typeof search.q === "string" && search.q.trim() !== "" ? search.q : undefined,
  }),
  beforeLoad: ({ params }) => {
    if (parseStreamKey(params.streamKey) === null) {
      throw redirect({ to: "/stream/$streamKey", params: { streamKey: "all" } });
    }
  },
  component: StreamLayout,
});

function StreamLayout() {
  const { streamKey } = Route.useParams();
  const search = Route.useSearch();
  const prefs = useViewPrefs();
  const childMatches = useChildMatches();

  const stream = parseStreamKey(streamKey);
  // beforeLoad already redirected an unreadable key.
  if (stream === null) return null;

  // The recently-read stream is read entries by definition, always newest first.
  const readStream = stream.kind === "read";
  const unreadOnly = readStream ? false : prefs.unread;
  const ranked = readStream ? "newest" : prefs.ranked;
  const readerOpen = childMatches.length > 0;

  return (
    <Panes
      list={
        <MosaicGrid
          streamKey={toStreamKey(stream)}
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
