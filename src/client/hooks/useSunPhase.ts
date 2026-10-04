import { useQuery } from "@tanstack/react-query";
import { sunQueryOptions } from "client/api/queries";

const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

// `tz` is a seam for tests; undefined while loading, offline or for a zone with no coordinates.
export const useSunPhase = ({ tz = browserTimeZone() }: { tz?: string } = {}):
  | "day"
  | "dusk"
  | undefined => useQuery(sunQueryOptions({ tz })).data?.phase ?? undefined;
