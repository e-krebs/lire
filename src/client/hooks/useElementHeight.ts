import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";

interface ElementHeight {
  attach: (element: HTMLElement | null) => void;
  height: number;
}

export const useElementHeight = (): ElementHeight => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    if (!element) return undefined;

    // Zero means hidden (the phone's list behind the reader): keep the last height, as the width hook does.
    const update = () => {
      const next = element.offsetHeight;
      if (next === 0) return;
      setHeight(next);
    };

    update();
    if (typeof ResizeObserver === "undefined") return undefined;

    // A resize is measured before paint, so the grid it moves has to commit before paint too.
    const observer = new ResizeObserver(() => {
      flushSync(update);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element]);

  return { attach: setElement, height };
};
