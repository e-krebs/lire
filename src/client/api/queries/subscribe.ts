import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  analyzeWebFeed,
  createFeed,
  createWebFeed,
  deleteFeed,
  getNewsletterAddress,
  getWebFeedStatus,
  reanalyzeWebFeed,
  searchFeeds,
} from "client/api/client";
import { keys } from "client/api/keys";
import { invalidateLibrary } from "./shared";

// `query` must already be debounced (~400ms) by the caller — this hook fires as soon as it's
// enabled, it does no timing of its own.
export const useFeedLookup = (query: string) =>
  useQuery({
    queryKey: keys.feedLookup(query),
    queryFn: async () => searchFeeds(query),
    enabled: query.trim().length > 3,
  });

export const useSubscribe = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createFeed,
    onSuccess: () => {
      invalidateLibrary(client);
    },
  });
};

export const useAnalyzeWebFeed = () => useMutation({ mutationFn: analyzeWebFeed });

// Applies a variant to a page: a new web feed, or a swap on one already followed.
export const useCreateWebFeed = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createWebFeed,
    onSuccess: () => {
      invalidateLibrary(client);
    },
  });
};

export const useReanalyzeWebFeed = () => useMutation({ mutationFn: reanalyzeWebFeed });

const WEB_FEED_POLL_MS = 2000;
// NewsBlur keeps an analysis five minutes, and nothing tells a dead id from a slow one.
const WEB_FEED_TIMEOUT_MS = 90_000;

// Polls until the analysis is done or failed, or until `timedOut`, which stops the polling.
export const useWebFeedStatus = ({ requestId }: { requestId: string | undefined }) => {
  const [timedOutId, setTimedOutId] = useState<string>();
  useEffect(() => {
    if (requestId === undefined) return undefined;
    const timer = setTimeout(() => {
      setTimedOutId(requestId);
    }, WEB_FEED_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [requestId]);
  const timedOut = requestId !== undefined && timedOutId === requestId;
  const query = useQuery({
    queryKey: keys.webFeedStatus(requestId ?? ""),
    queryFn: async () => getWebFeedStatus({ requestId: requestId ?? "" }),
    enabled: requestId !== undefined && !timedOut,
    refetchInterval: ({ state }) =>
      state.data && state.data.status !== "pending" ? false : WEB_FEED_POLL_MS,
    gcTime: 0,
  });
  return { ...query, timedOut };
};

// The address is fixed per account, so one GET per session.
export const useNewsletterAddress = () =>
  useQuery({
    queryKey: keys.newsletterAddress,
    queryFn: getNewsletterAddress,
    staleTime: Infinity,
  });

export const useUnsubscribe = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteFeed,
    onSuccess: (_data, feedId) => {
      const feedKey = `feed:${feedId}`;
      const isStreamOf = (key: readonly unknown[], match: (streamKey: string) => boolean) =>
        (key[0] === "stream" || key[0] === "search") && typeof key[1] === "string" && match(key[1]);
      client.removeQueries({
        predicate: ({ queryKey }) => isStreamOf(queryKey, (k) => k === feedKey),
      });
      // These list the feed's entries.
      void client.invalidateQueries({
        predicate: ({ queryKey }) =>
          isStreamOf(queryKey, (k) => k === "all" || k.startsWith("folder:")),
      });
      invalidateLibrary(client);
    },
  });
};
