// The UI language: the browser's by default, or the one picked in the account menu, remembered
// per device in localStorage.

import { useSyncExternalStore } from "react";

export type Locale = "en" | "fr";

/** @public Read by the language select. */
export type LocalePreference = "system" | Locale;

const LOCALE_STORAGE_KEY = "lire.locale";

const load = (): LocalePreference => {
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return raw === "en" || raw === "fr" ? raw : "system";
  } catch {
    return "system";
  }
};

const save = (next: LocalePreference): void => {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // A private window or a full quota: the choice still holds for this session.
  }
};

// Read on every call, never captured at import, so a test can stub the global.
const systemLocale = (): Locale => {
  const match = navigator.languages
    .map((tag) => tag.toLowerCase())
    .find((tag) => tag.startsWith("fr") || tag.startsWith("en"));
  return match?.startsWith("fr") ? "fr" : "en";
};

let preference = load();

const activeLocale = (): Locale => (preference === "system" ? systemLocale() : preference);

const listeners = new Set<() => void>();

const notify = (): void => {
  document.documentElement.lang = activeLocale();
  for (const listener of listeners) listener();
};

const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

document.documentElement.lang = activeLocale();
window.addEventListener("languagechange", notify);

/** @public Called by the language select and the test setup. */
export const setLocalePreference = (next: LocalePreference): void => {
  preference = next;
  save(next);
  notify();
};

/** @public Read by the language select. */
export const useLocalePreference = (): LocalePreference =>
  useSyncExternalStore(subscribe, () => preference);

export const useLocale = (): Locale => useSyncExternalStore(subscribe, activeLocale);
