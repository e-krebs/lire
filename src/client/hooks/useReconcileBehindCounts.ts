import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { StreamKey } from "shared/feedsApi/streamKey";
import type { Entry } from "shared/feedsApi/types";
import { keys } from "client/api/keys";
import { unreadCountFor, useCounts } from "client/api/queries";

export const useReconcileBehindCounts = ({
  enabled,
  streamKey,
  entries,
  hasNextPage,
  isFetching,
  dataUpdatedAt,
  reconcile,
}: {
  enabled: boolean;
  streamKey: StreamKey;
  entries: Entry[];
  hasNextPage: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  reconcile: () => Promise<void>;
}) => {
  // The top bar count and the list come from two calls. Counts newer than the list that name more
  // unread than a fully loaded list holds mean the list missed entries: refetch it once. A list
  // fetched after the counts never retriggers, so entries NewsBlur counts but hides cause no loop.
  const queryClient = useQueryClient();
  const counts = useCounts({ enabled });
  // Counts as of the last reconcile's end: the reconcile refetches the counts first, so a
  // failed list would otherwise find them newer and retry forever.
  const reconciledCountsAt = useRef(0);
  const listBehindCounts =
    enabled &&
    counts.data !== undefined &&
    !hasNextPage &&
    !isFetching &&
    counts.dataUpdatedAt > dataUpdatedAt &&
    counts.dataUpdatedAt > reconciledCountsAt.current &&
    entries.filter((entry) => entry.unread).length <
      unreadCountFor({ counts: counts.data, streamKey });
  useEffect(() => {
    if (!listBehindCounts) return;
    void reconcile()
      .catch(() => {})
      .finally(() => {
        reconciledCountsAt.current = queryClient.getQueryState(keys.counts)?.dataUpdatedAt ?? 0;
      });
    // `reconcileList` is a new closure each render, and only the flag decides.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [listBehindCounts]);
};
