import { useT } from "client/i18n/useT";

export const CategoryRowsSkeleton = () => {
  const t = useT().navigation;
  return (
    <div role="status" aria-busy="true" aria-label={t.loadingCategories} className="mt-0.5">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          aria-hidden="true"
          className="my-1 h-8 rounded-lg bg-surface-2 motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
};
