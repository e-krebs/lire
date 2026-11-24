import { useEffect, useRef } from "react";

// Compares against the last step, not a mount flag, because StrictMode runs effects twice on mount.
export const useStepFocus = ({ step }: { step: string }) => {
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(step);

  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    heading.current?.focus();
  }, [step]);

  return heading;
};
