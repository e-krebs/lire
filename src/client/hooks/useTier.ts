import { useSyncExternalStore } from "react";

// Thresholds match `--breakpoint-sm/lg` in styles.css.
type Tier = "phone" | "tablet" | "desktop";

const TABLET_MIN = "(min-width: 40rem)";
const DESKTOP_MIN = "(min-width: 64rem)";

const read = (): Tier => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "desktop";
  if (window.matchMedia(DESKTOP_MIN).matches) return "desktop";
  if (window.matchMedia(TABLET_MIN).matches) return "tablet";
  return "phone";
};

const subscribe = (onChange: () => void): (() => void) => {
  // Same feature flag as `read`: jsdom has no matchMedia, and a subscription with nothing to
  // listen to is just a no-op rather than a crash.
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const queries = [window.matchMedia(TABLET_MIN), window.matchMedia(DESKTOP_MIN)];
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
};

// Layout itself is CSS; this is for behaviour that differs per tier.
export const useTier = (): Tier => useSyncExternalStore(subscribe, read, () => "desktop");
