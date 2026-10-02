import { FreshnessRow } from "client/components/articles/FreshnessRow";
import { useT } from "client/i18n/useT";

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
}: MosaicFreshnessProps) => {
  const t = useT();
  return (
    <FreshnessRow updatedAt={updatedAt} refreshing={refreshing} onRefresh={onRefresh}>
      {searchQuery === undefined ? undefined : (
        <span>
          {t.articles.resultsFor({ query: searchQuery })}{" "}
          <span className="tabular-nums">{count}</span> {t.articles.articleWord({ count })}
        </span>
      )}
    </FreshnessRow>
  );
};
