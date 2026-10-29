import { useEffect, useState } from "react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useChildMatches,
  useNavigate,
} from "@tanstack/react-router";
import { parseStreamKey, toStreamKey } from "shared/feedsApi/streamKey";
import { Panes } from "client/components/app/shell/AppShell";
import { MosaicGrid } from "client/components/feed/mosaic/MosaicGrid";
import {
  SourceListKeyContext,
  createSourceListKeyStore,
} from "client/components/reader/article/SourceListKeyContext";
import { useFeeds } from "client/api/queries";
import { OnboardingCard } from "client/components/app/onboarding/OnboardingCard";
import { useOnboardingCard } from "client/hooks/useOnboardingCard";
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
  const navigate = useNavigate();
  const feeds = useFeeds();
  const onboarding = useOnboardingCard();
  const [sourceListKey] = useState(createSourceListKeyStore);

  const stream = parseStreamKey(streamKey);
  const missingFeedId =
    stream?.kind === "feed" &&
    feeds.data !== undefined &&
    !feeds.isFetching &&
    !feeds.data.some((feed) => feed.id === stream.feedId)
      ? stream.feedId
      : null;
  // Covers Back, deep links and stale tabs after an unsubscribe.
  useEffect(() => {
    if (missingFeedId === null) return;
    void navigate({ to: "/stream/$streamKey", params: { streamKey: "all" }, replace: true });
  }, [missingFeedId, navigate]);
  // beforeLoad already redirected an unreadable key.
  if (stream === null || missingFeedId !== null) return null;

  // The recently-read stream is read entries by definition, always newest first.
  const readStream = stream.kind === "read";
  const unreadOnly = readStream ? false : prefs.unread;
  const ranked = readStream ? "newest" : prefs.ranked;
  const readerOpen = childMatches.length > 0;

  const checklist =
    onboarding.state && !onboarding.state.dismissed ? (
      <OnboardingCard
        steps={onboarding.steps}
        collapsed={onboarding.state.collapsed}
        onToggleCollapse={onboarding.toggleCollapse}
        onToggleStep={onboarding.toggleStep}
        onAction={onboarding.onAction}
        dismissing={onboarding.dismissing}
        onDismissStart={onboarding.onDismissStart}
        onDismiss={onboarding.onDismiss}
      />
    ) : undefined;

  return (
    <SourceListKeyContext.Provider value={sourceListKey}>
      <Panes
        list={
          <MosaicGrid
            streamKey={toStreamKey(stream)}
            unreadOnly={unreadOnly}
            ranked={ranked}
            query={search.q}
            readerOpen={readerOpen}
            leading={checklist}
          />
        }
        reader={readerOpen ? <Outlet /> : null}
      />
    </SourceListKeyContext.Provider>
  );
}
