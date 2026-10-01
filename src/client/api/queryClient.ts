import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "client/api/client";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const MAX_RETRIES = 1;

const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (error instanceof ApiError && (error.status === 401 || error.status === 429)) return false;
  return failureCount < MAX_RETRIES;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: TEN_MINUTES_MS,
      gcTime: THIRTY_MINUTES_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: shouldRetry,
    },
  },
});
