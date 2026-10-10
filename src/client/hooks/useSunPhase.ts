import { useQuery } from "@tanstack/react-query";
import { sunQueryOptions } from "client/api/queries";

const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

// `tz` is a seam for tests; `phase` is undefined while loading, offline or for a zone with no coordinates.
export const useSunPhase = ({ tz = browserTimeZone() }: { tz?: string } = {}): {
  phase: "day" | "dusk" | undefined;
  pending: boolean;
} => {
  const { data, isPending } = useQuery(sunQueryOptions({ tz }));
  return { phase: data?.phase ?? undefined, pending: isPending };
};
