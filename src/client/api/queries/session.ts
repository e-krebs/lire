import { useQuery, queryOptions } from "@tanstack/react-query";
import {
  getAuthStatus,
  getCategories,
  getCounts,
  getFeeds,
  getProfile,
  getSunPhase,
} from "client/api/client";
import { keys } from "client/api/keys";
import { sendQueuedReads } from "client/api/markQueue";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export const useAuthStatus = () => useQuery({ queryKey: keys.authStatus, queryFn: getAuthStatus });

export const useProfile = () => useQuery({ queryKey: keys.profile, queryFn: getProfile });

export const useCategories = () => useQuery({ queryKey: keys.categories, queryFn: getCategories });

export const useFeeds = () => useQuery({ queryKey: keys.feeds, queryFn: getFeeds });

export const useCounts = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: keys.counts,
    queryFn: async () => {
      await sendQueuedReads();
      return getCounts();
    },
    refetchOnMount: false,
    enabled,
  });

const SUN_MARGIN_MS = 30 * 1000;

const msUntilChange = (nextChangeAt: string | undefined): number =>
  nextChangeAt === undefined
    ? FIVE_MINUTES_MS
    : Math.max(Date.parse(nextChangeAt) - Date.now() + SUN_MARGIN_MS, SUN_MARGIN_MS);

export const sunQueryOptions = ({ tz }: { tz: string }) =>
  queryOptions({
    queryKey: keys.sun(tz),
    queryFn: async () => getSunPhase({ tz }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: true,
    staleTime: (query) => {
      const next = query.state.data?.nextChangeAt;
      return next === undefined
        ? FIVE_MINUTES_MS
        : Math.max(Date.parse(next) - query.state.dataUpdatedAt + SUN_MARGIN_MS, SUN_MARGIN_MS);
    },
    refetchInterval: (query) => msUntilChange(query.state.data?.nextChangeAt),
  });
