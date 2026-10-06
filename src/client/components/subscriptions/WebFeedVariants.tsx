import { useId } from "react";
import { useT } from "client/i18n/useT";
import type { WebFeedStatus } from "shared/feedsApi/types";

const retryClassName = `
  min-h-11 flex-none rounded-xl bg-danger-soft px-4 text-sm font-semibold text-danger
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
`;

interface WebFeedVariantsProps {
  /** The latest poll answer, `undefined` before the first one. */
  status: WebFeedStatus | undefined;
  /** The analysis, its poll or its request failed. */
  failed: boolean;
  /** The poll gave up before the analysis finished. */
  timedOut: boolean;
  /** The picked variant. */
  selected: number | undefined;
  onSelect: (index: number) => void;
  onRetry: () => void;
}

export const WebFeedVariants = ({
  status,
  failed,
  timedOut,
  selected,
  onSelect,
  onRetry,
}: WebFeedVariantsProps) => {
  const { subscriptions: t, common } = useT();
  const groupName = useId();
  const variants = status?.status === "done" ? status.variants : undefined;

  if (failed || status?.status === "failed" || (timedOut && variants === undefined)) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 text-sm text-danger">
        <span>{failed || status?.status === "failed" ? t.analyzeFailed : t.analyzeTimedOut}</span>
        <button type="button" onClick={onRetry} className={retryClassName}>
          {common.retry}
        </button>
      </div>
    );
  }

  if (variants === undefined) {
    return (
      <div role="status" className="flex min-h-11 items-center gap-3 text-sm text-ink">
        <span
          aria-hidden="true"
          className="size-5 flex-none rounded-full border-2 border-hairline border-t-accent-text motion-safe:animate-spin"
        />
        {t.analyzing}
      </div>
    );
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{t.variantsLabel}</legend>
      <div className="flex items-baseline justify-between gap-2" aria-hidden="true">
        <span className="text-xs font-semibold text-muted">{t.variantsLabel}</span>
        <span className="text-xs text-faint tabular-nums">
          {t.variantsFound({ count: variants.length })}
        </span>
      </div>
      <p className="text-xs text-faint">{t.variantsHint({ count: variants.length })}</p>
      <div className="flex flex-col gap-2">
        {variants.map((variant, index) => (
          <label
            // The analysis hands variants in a fixed order, and the pick is that index.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            className={`
              block rounded-xl px-3 py-2 ring-1 ring-hairline ring-inset
              has-checked:bg-accent-soft has-checked:ring-accent-text
            `}
          >
            <span className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name={groupName}
                checked={selected === index}
                onChange={() => {
                  onSelect(index);
                }}
                className={`
                  size-5 flex-none accent-accent
                  focus-visible:outline-2 focus-visible:outline-accent
                `}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                {variant.label ?? t.variantFallback({ index: index + 1 })}
              </span>
              <span className="text-xs whitespace-nowrap text-faint tabular-nums">
                {t.variantSamples({ count: variant.previews.length })}
              </span>
            </span>
            {variant.previews.length === 0 ? null : (
              <ul className="flex flex-col gap-1.5 pb-1">
                {variant.previews.map((preview, previewIndex) => (
                  // oxlint-disable-next-line react/no-array-index-key
                  <li key={previewIndex} className="min-w-0 text-xs">
                    <span className="block truncate text-ink">{preview.title ?? preview.url}</span>
                    {preview.summary === undefined ? null : (
                      <span className="block truncate text-faint">{preview.summary}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
};
