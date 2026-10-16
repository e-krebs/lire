import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "client/api/client";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const MAX_RETRIES = 1;
const MAX_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_FALLBACK_SECONDS = 60;
const RATE_LIMIT_CAP_MS = 2 * 60 * 1000;

const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (error instanceof ApiError && error.status === 401) return false;
  if (error instanceof ApiError && error.status === 429)
    return failureCount < MAX_RATE_LIMIT_RETRIES;
  return failureCount < MAX_RETRIES;
};

// TanStack does not export its default delay, so the same formula is repeated here.
const retryDelay = (failureCount: number, error: unknown): number => {
  if (error instanceof ApiError && error.code === "rate_limited") {
    return Math.min((error.retryAfter ?? RATE_LIMIT_FALLBACK_SECONDS) * 1000, RATE_LIMIT_CAP_MS);
  }
  return Math.min(1000 * 2 ** failureCount, 30 * 1000);
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: TEN_MINUTES_MS,
      gcTime: THIRTY_MINUTES_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: shouldRetry,
      retryDelay,
    },
  },
});
