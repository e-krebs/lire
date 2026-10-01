import { PREFERENCE_DELETE } from "client/api/client";
import { usePreferences, useUpdatePreferences } from "client/api/queries";

// Feeds whose articles skip the reader and open on the publisher's own site. Held in the
// account's own preferences bucket, under the key the official web app uses for the same setting,
// so the flag follows the account across devices. Keyed by the feed id (`subscription.id`,
// `entry.origin.streamId`), so a tile can ask without a lookup.

const directOpenKey = (feedId: string): string => `subscription/${feedId}/entryNavigation`;

export const useDirectOpen = (feedId: string): boolean =>
  usePreferences().data?.[directOpenKey(feedId)] === "visit";

// Off deletes the key rather than writing the official web app's "inline", so the bucket only
// holds what is on.
export const useSetDirectOpen = (): ((feedId: string, on: boolean) => void) => {
  const updatePreferences = useUpdatePreferences();
  return (feedId, on) => {
    updatePreferences.mutate({ [directOpenKey(feedId)]: on ? "visit" : PREFERENCE_DELETE });
  };
};
