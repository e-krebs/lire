import { useLayoutEffect, useState } from "react";

const FALLBACK_WIDTH = 960;

interface ElementWidth {
  // Callback ref: the element mounts after a skeleton, so a RefObject would never re-arm.
  attach: (element: HTMLElement | null) => void;
  element: HTMLElement | null;
  // Content-box width; undefined before the first measure. Without ResizeObserver (jsdom) it
  // falls back so layouts still render.
  width: number | undefined;
}

export const useElementWidth = (): ElementWidth => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    if (!element) return undefined;

    // A frame hidden by `display: none` (the phone's list behind the reader) measures 0; laying
    // the tiles out for that width would only make them fly back into place when it shows again.
    const update = (next: number) => {
      if (next === 0) return;
      setWidth((current) => (current === next ? current : next));
    };

    if (typeof ResizeObserver === "undefined") {
      update(element.clientWidth || FALLBACK_WIDTH);
      return undefined;
    }

    update(Math.round(element.getBoundingClientRect().width));

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) update(Math.round(entry.contentRect.width));
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [element]);

  return { attach: setElement, element, width };
};
