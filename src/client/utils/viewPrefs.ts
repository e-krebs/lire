// The unread filter and the sort order, remembered per device in localStorage, never in the URL.

import { useSyncExternalStore } from "react";

type Ranked = "newest" | "oldest";

export interface ViewPrefs {
  unread: boolean;
  ranked: Ranked;
}

export const VIEW_PREFS_STORAGE_KEY = "lire.view";

const DEFAULTS: ViewPrefs = { unread: true, ranked: "newest" };

const load = (): ViewPrefs => {
  try {
    const raw = window.localStorage.getItem(VIEW_PREFS_STORAGE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
    return {
      unread: "unread" in parsed && typeof parsed.unread === "boolean" ? parsed.unread : true,
      ranked: "ranked" in parsed && parsed.ranked === "oldest" ? "oldest" : "newest",
    };
  } catch {
    return DEFAULTS;
  }
};

const save = (prefs: ViewPrefs): void => {
  try {
    window.localStorage.setItem(VIEW_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // A private window or a full quota: the choice still holds for this session.
  }
};

let prefs = load();

const listeners = new Set<() => void>();

const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

export const setViewPrefs = (next: Partial<ViewPrefs>): void => {
  prefs = { ...prefs, ...next };
  save(prefs);
  for (const listener of listeners) listener();
};

export const useViewPrefs = (): ViewPrefs =>
  useSyncExternalStore(
    subscribe,
    () => prefs,
    () => DEFAULTS,
  );

// Tests only: the module state outlives a cleared localStorage.
export const reloadViewPrefs = (): void => {
  prefs = load();
  for (const listener of listeners) listener();
};
