import { FreshnessRow } from "client/components/articles/FreshnessRow";

interface MosaicFreshnessProps {
  updatedAt: number | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  searchQuery: string | undefined;
  count: number;
}

export const MosaicFreshness = ({
  updatedAt,
  refreshing,
  onRefresh,
  searchQuery,
  count,
}: MosaicFreshnessProps) => (
  <FreshnessRow updatedAt={updatedAt} refreshing={refreshing} onRefresh={onRefresh}>
    {searchQuery === undefined ? undefined : (
      <span>
        Results for “{searchQuery}” · <span className="tabular-nums">{count}</span>{" "}
        {count === 1 ? "article" : "articles"}
      </span>
    )}
  </FreshnessRow>
);
