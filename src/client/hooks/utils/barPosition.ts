// Where the app bar sits: at the top, or at the bottom for thumbs on a phone. Per device, so it
// lives in localStorage like the direct-open flags. Mirrored onto <html data-bar> so CSS outside
// the shell (the portalled popover, the sheet, the account menu) can follow it too.

export type BarPosition = "top" | "bottom";

export const STORAGE_KEY = "lire.barPosition";

const load = (): BarPosition => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "bottom" ? "bottom" : "top";
  } catch {
    return "top";
  }
};

const save = (position: BarPosition): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, position);
  } catch {
    // A private window or a full quota: the choice still holds for this session.
  }
};

const reflect = (position: BarPosition): void => {
  if (typeof document === "undefined") return;
  if (position === "bottom") document.documentElement.dataset.bar = "bottom";
  else delete document.documentElement.dataset.bar;
};

let position = load();

export const getBarPosition = (): BarPosition => position;
reflect(position);

const listeners = new Set<() => void>();

export const subscribeBarPosition = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

export const setBarPosition = (next: BarPosition): void => {
  if (next === position) return;
  position = next;
  save(next);
  reflect(next);
  for (const listener of listeners) listener();
};
