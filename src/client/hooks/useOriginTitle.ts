import { useFeeds } from "client/api/queries";

// The feed holds the name the account gave it, so it comes before the title the entry carries.
export const useOriginTitle = ({ feedId }: { feedId: string }): string =>
  useFeeds().data?.find((feed) => feed.id === feedId)?.title ?? "";
