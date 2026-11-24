import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Slides the old step out, then the new one in. The old step stays mounted as an inert copy for
 * the exit, so step content mounts twice for 150ms: keep mount effects idempotent, and give a
 * heading ref only to the live step. The copy is skipped under reduced motion.
 */
interface StepPanelProps {
  /** Position of the shown step: the panel slides in from the side the index moved to. */
  index: number;
  className?: string;
  children: ReactNode;
}

interface Leaving {
  index: number;
  children: ReactNode;
}

const EXIT_MS = 150;

const canAnimate = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

export const StepPanel = ({ index, className = "", children }: StepPanelProps) => {
  const shown = useRef<Leaving>({ index, children });
  const [move, setMove] = useState<{ forward?: boolean; leaving?: Leaving }>({});

  // Before paint, so the old step never shows as already gone. The effect below updates `shown`
  // after this one, so here it still holds the step that was on screen.
  useLayoutEffect(() => {
    if (shown.current.index === index) return;
    setMove({
      forward: index > shown.current.index,
      leaving: canAnimate() ? shown.current : undefined,
    });
  }, [index]);

  useEffect(() => {
    shown.current = { index, children };
  });

  const { leaving } = move;
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => {
      setMove((current) => ({ ...current, leaving: undefined }));
    }, EXIT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [leaving]);

  return (
    <div className="-mx-1 grid overflow-x-clip px-1">
      <div
        key={index}
        className={`col-start-1 row-start-1 min-w-0 ${move.forward === undefined ? "" : move.forward ? "step-enter-forward" : "step-enter-back"} ${className}`}
      >
        {children}
      </div>
      {leaving && (
        <div
          key={`leaving-${leaving.index}`}
          inert
          aria-hidden="true"
          className={`pointer-events-none col-start-1 row-start-1 min-w-0 ${move.forward ? "step-exit-forward" : "step-exit-back"} ${className}`}
        >
          {leaving.children}
        </div>
      )}
    </div>
  );
};
