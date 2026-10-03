import { directOpenKey } from "shared/feedsApi/preferences";
import { usePreferences, useUpdatePreferences } from "client/api/queries";

// Feeds whose articles skip the reader and open on the publisher's own site. Held in the
// account's preferences, so the flag follows the account across devices. Keyed by the feed id
// (`feed.id`, `entry.feedId`), so a tile can ask without a lookup.

export const useDirectOpen = (feedId: string): boolean =>
  usePreferences().data?.[directOpenKey(feedId)] === "visit";

// Off deletes the key, so the preferences only hold what is on.
export const useSetDirectOpen = (): ((feedId: string, on: boolean) => void) => {
  const updatePreferences = useUpdatePreferences();
  return (feedId, on) => {
    updatePreferences.mutate({ [directOpenKey(feedId)]: on ? "visit" : null });
  };
};
