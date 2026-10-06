import { directOpenKey } from "shared/feedsApi/preferences";
import { useFeeds, usePreferences, useUpdatePreferences } from "client/api/queries";

// Feeds whose articles skip the reader and open on the publisher's own site. Held in the
// account's preferences, so the flag follows the account across devices. Keyed by the feed id
// (`feed.id`, `entry.feedId`), so a tile can ask without a lookup.

// A newsletter has no site of its own, so a flag stored earlier is ignored.
export const useDirectOpen = (feedId: string): boolean => {
  const flagged = usePreferences().data?.[directOpenKey(feedId)] === "visit";
  const isNewsletter = useFeeds().data?.find((feed) => feed.id === feedId)?.isNewsletter === true;
  return flagged && !isNewsletter;
};

// Off deletes the key, so the preferences only hold what is on.
export const useSetDirectOpen = (): ((feedId: string, on: boolean) => void) => {
  const updatePreferences = useUpdatePreferences();
  return (feedId, on) => {
    updatePreferences.mutate({ [directOpenKey(feedId)]: on ? "visit" : null });
  };
};
