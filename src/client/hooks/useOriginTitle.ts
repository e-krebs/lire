import { useSubscriptions } from "client/api/queries";

// Feedly names a newsletter feed after the sender, and falls back to "Unnamed newsletter" when
// there is none. The subscription holds the name the account gave the feed, so it comes first.
export const useOriginTitle = (origin: { streamId: string; title?: string }): string =>
  useSubscriptions().data?.find((subscription) => subscription.id === origin.streamId)?.title ??
  origin.title ??
  origin.streamId;
