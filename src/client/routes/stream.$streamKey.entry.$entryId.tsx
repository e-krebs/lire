import { createFileRoute, Link, type ErrorComponentProps } from "@tanstack/react-router";
import { Reader } from "client/components/reader/article/Reader";
import { RouteError } from "client/components/app/notices/RouteError";
import { useT } from "client/i18n/useT";

export const Route = createFileRoute("/stream/$streamKey/entry/$entryId")({
  component: EntryRoute,
  errorComponent: EntryError,
});

// No auto mark-read on open, and no chrome of its own: the panel's own exits decide the entry's
// read state, and they need the stream key to navigate back to.
function EntryRoute() {
  const { streamKey, entryId } = Route.useParams();
  return <Reader entryId={entryId} streamKey={streamKey} />;
}

// The open reader hides the list on mobile, so this link is the way back.
function EntryError(props: ErrorComponentProps) {
  const { streamKey } = Route.useParams();
  const { shell } = useT();
  return (
    <div className="absolute inset-0 overflow-y-auto bg-canvas">
      <RouteError {...props}>
        <Link
          to="/stream/$streamKey"
          params={{ streamKey }}
          className="text-sm font-medium text-ink underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {shell.goBack}
        </Link>
      </RouteError>
    </div>
  );
}
