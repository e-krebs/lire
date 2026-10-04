import { useEffect, useRef } from "react";

const HIDDEN_REFRESH_MS = 60_000;

export const useRefreshOnForeground = ({
  onForeground,
}: {
  onForeground: () => Promise<void>;
}): void => {
  const latest = useRef(onForeground);
  useEffect(() => {
    latest.current = onForeground;
  });
  useEffect(() => {
    let hiddenAt: number | undefined;
    let running = false;
    const onChange = (): void => {
      if (document.visibilityState === "hidden") {
        hiddenAt ??= Date.now();
        return;
      }
      const wasHiddenFor = hiddenAt === undefined ? 0 : Date.now() - hiddenAt;
      hiddenAt = undefined;
      if (wasHiddenFor <= HIDDEN_REFRESH_MS || running) return;
      running = true;
      void latest
        .current()
        .catch(() => {})
        .finally(() => {
          running = false;
        });
    };
    document.addEventListener("visibilitychange", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
    };
  }, []);
};
