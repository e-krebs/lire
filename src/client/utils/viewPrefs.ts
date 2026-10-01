// The unread filter and the sort order, remembered per device so a stream opened without them in
// its URL comes back the way the last toggle left it.

export type Ranked = "newest" | "oldest";

export interface ViewPrefs {
  unread: boolean;
  ranked: Ranked;
}

export const VIEW_PREFS_STORAGE_KEY = "lire.view";

const DEFAULTS: ViewPrefs = { unread: true, ranked: "newest" };

export const loadViewPrefs = (): ViewPrefs => {
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

export const saveViewPrefs = (prefs: ViewPrefs): void => {
  try {
    window.localStorage.setItem(VIEW_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // A private window or a full quota: the choice still holds for this session.
  }
};
