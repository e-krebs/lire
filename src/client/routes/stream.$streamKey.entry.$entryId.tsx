import { createFileRoute } from "@tanstack/react-router";
import { Reader } from "client/components/reader/Reader";

export const Route = createFileRoute("/stream/$streamKey/entry/$entryId")({
  component: EntryRoute,
});

// No auto mark-read on open, and no chrome of its own: the panel's own exits decide the entry's
// read state, and they need the stream key to navigate back to.
function EntryRoute() {
  const { streamKey, entryId } = Route.useParams();
  return <Reader entryId={entryId} streamKey={streamKey} />;
}
