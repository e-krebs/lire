import { layoutMasonry } from "client/utils/masonry";
import { useElementWidth } from "client/hooks/useElementWidth";
import { useT } from "client/i18n/useT";

// Aspects the real mosaic tends to produce, so the placeholder columns look like the grid.
const SKELETON_ASPECTS = [0.8, 1, 1.33, 0.75, 1.5, 0.9, 1.2, 0.8, 1.78, 1];

export const MosaicSkeleton = ({ label, count }: { label?: string; count?: number }) => {
  const t = useT();
  const { attach, width } = useElementWidth();
  const layout =
    width === undefined
      ? undefined
      : layoutMasonry({
          containerWidth: width,
          items: SKELETON_ASPECTS.slice(0, count).map((aspect, index) => ({
            id: String(index),
            aspect,
          })),
        });

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label ?? t.articles.loadingArticles}
      className="p-3"
    >
      <div ref={attach} className="relative" style={{ height: layout?.height ?? 0 }}>
        {layout === undefined
          ? null
          : [...layout.positions].map(([id, slot]) => (
              <div
                key={id}
                aria-hidden="true"
                style={{
                  translate: `${slot.x}px ${slot.y}px`,
                  width: slot.width,
                  height: slot.height,
                }}
                className="absolute top-0 left-0 rounded-xl bg-surface-2 motion-safe:animate-pulse"
              />
            ))}
      </div>
    </div>
  );
};
