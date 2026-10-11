import { useEffect, useRef } from "react";
import type { RefObject } from "react";

// Waits for the transitions the exit just started; none under reduced motion or in jsdom.
const afterExit = (element: Element, done: () => void): (() => void) => {
  let cancelled = false;
  const running = typeof element.getAnimations === "function" ? element.getAnimations() : [];
  void Promise.allSettled(running.map(async (animation) => animation.finished)).then(() => {
    if (!cancelled) done();
  });
  return () => {
    cancelled = true;
  };
};

// Calls the owner back once the exit has run. Declared after any effect that starts the exit.
export const useAfterExit = (
  element: RefObject<HTMLElement | null>,
  onExited: (() => void) | null,
): void => {
  const closing = onExited !== null;
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);
  useEffect(() => {
    if (!closing || !element.current) return undefined;
    return afterExit(element.current, () => {
      onExitedRef.current?.();
    });
  }, [closing, element]);
};
