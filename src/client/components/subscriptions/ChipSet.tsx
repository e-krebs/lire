import { useLayoutEffect, useRef, useState } from "react";
import { useElementWidth } from "client/hooks/useElementWidth";

interface ChipSetProps {
  /** Text of each chip. */
  labels: readonly string[];
  className?: string;
}

interface FitOptions {
  widths: readonly number[];
  moreWidth: number;
  available: number;
  gap: number;
}

// How many chips fit on one line, leaving room for the `+N` chip whenever some stay hidden. The
// first chip always shows, truncated if it has to be.
const fitChipCount = ({ widths, moreWidth, available, gap }: FitOptions): number => {
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
  if (total <= available) return widths.length;
  let used = moreWidth;
  let count = 0;
  for (const width of widths) {
    if (used + gap + width > available) break;
    used += gap + width;
    count += 1;
  }
  return Math.max(count, Math.min(1, widths.length));
};

const GAP = 4;

// ScopeChip's skin, without the ×.
const chipClassName = `
  flex h-7 min-w-0 max-w-36 items-center rounded-full bg-accent-soft px-2.5 text-xs
  font-semibold whitespace-nowrap text-accent-text
`;
const moreClassName = `
  flex h-7 flex-none items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap
  text-faint tabular-nums ring-1 ring-hairline ring-inset
`;

export const ChipSet = ({ labels, className }: ChipSetProps) => {
  const { attach, width } = useElementWidth();
  const measureRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(labels.length);

  useLayoutEffect(() => {
    const measure = measureRef.current;
    if (!measure || width === undefined) return;
    const chips = Array.from(measure.children, (child) =>
      child instanceof HTMLElement ? child.offsetWidth : 0,
    );
    const moreWidth = chips.pop() ?? 0;
    setCount(fitChipCount({ widths: chips, moreWidth, available: width, gap: GAP }));
  }, [labels, width]);

  const shown = labels.slice(0, count);
  const hidden = labels.slice(count);

  return (
    <div
      ref={attach}
      className={`relative flex min-w-0 items-center gap-1 overflow-hidden ${className ?? ""}`}
    >
      {shown.map((label) => (
        <span key={label} className={chipClassName}>
          <span data-tip={label} data-tip-overflow="" className="truncate">
            {label}
          </span>
        </span>
      ))}
      {hidden.length === 0 ? null : (
        <span data-tip={hidden.join(", ")} className={moreClassName}>
          <span aria-hidden="true">{`+${hidden.length}`}</span>
          <span className="sr-only">{`, also in ${hidden.join(", ")}`}</span>
        </span>
      )}
      {/* Every chip at its natural width, plus the widest `+N`, for the fit above. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 flex w-max gap-1"
      >
        {labels.map((label) => (
          <span key={label} className={chipClassName}>
            <span className="truncate">{label}</span>
          </span>
        ))}
        <span className={moreClassName}>{`+${labels.length}`}</span>
      </div>
    </div>
  );
};
