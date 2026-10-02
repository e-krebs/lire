import type { Locale } from "client/i18n/locale";

// The fixed words stay here rather than in the catalog, so this util does not depend on it.
const WORDS: Record<
  Locale,
  {
    justNow: string;
    now: string;
    gap: string;
    m: string;
    h: string;
    d: string;
    w: string;
  }
> = {
  en: {
    justNow: "just now",
    now: "now",
    gap: "",
    m: "m",
    h: "h",
    d: "d",
    w: "w",
  },
  fr: {
    justNow: "à l'instant",
    now: "maintenant",
    gap: " ",
    m: "min",
    h: "h",
    d: "j",
    w: "sem",
  },
};

const perLocale = <T>(make: (locale: Locale) => T): ((locale: Locale) => T) => {
  const cache = new Map<Locale, T>();
  return (locale) => {
    let value = cache.get(locale);
    if (value === undefined) {
      value = make(locale);
      cache.set(locale, value);
    }
    return value;
  };
};

const relativeFormatter = perLocale(
  (locale) => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
);

const UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

interface TimeArgs {
  timestamp: number;
  locale: Locale;
}

/** Relative time for a list row ("3h ago"); falls back to "just now" under a minute. */
export const relativeTime = ({
  timestamp,
  locale,
  now = Date.now(),
}: TimeArgs & { now?: number }): string => {
  const diff = timestamp - now;
  for (const { unit, ms } of UNITS) {
    if (Math.abs(diff) >= ms) return relativeFormatter(locale).format(Math.round(diff / ms), unit);
  }
  return WORDS[locale].justNow;
};

const absoluteFormatter = perLocale(
  (locale) => new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }),
);

/** Full date and time, for tooltips and `dateTime` fallbacks. */
export const absoluteTime = ({ timestamp, locale }: TimeArgs): string =>
  absoluteFormatter(locale).format(timestamp);

const mediumDateFormatter = perLocale(
  (locale) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
);

/** Date alone for the reader header ("Sep 18, 2026"), where the full form crowds the masthead. */
export const mediumDate = ({ timestamp, locale }: TimeArgs): string =>
  mediumDateFormatter(locale).format(timestamp);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const shortDateFormatter = perLocale(
  (locale) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
);

const shortDateYearFormatter = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
);

/** Compact age for a card chip: "now", "5m", "3h", "2d", "3w", then "Mar 4" (year when not this one). */
export const shortRelativeTime = ({
  timestamp,
  locale,
  now = Date.now(),
}: TimeArgs & { now?: number }): string => {
  const words = WORDS[locale];
  const age = now - timestamp;
  if (age < MINUTE) return words.now;
  if (age < HOUR) return `${Math.floor(age / MINUTE)}${words.gap}${words.m}`;
  if (age < DAY) return `${Math.floor(age / HOUR)}${words.gap}${words.h}`;
  if (age < WEEK) return `${Math.floor(age / DAY)}${words.gap}${words.d}`;
  if (age < 5 * WEEK) return `${Math.floor(age / WEEK)}${words.gap}${words.w}`;

  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return (sameYear ? shortDateFormatter : shortDateYearFormatter)(locale).format(timestamp);
};
