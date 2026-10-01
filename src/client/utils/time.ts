const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

/** Relative time for a list row ("3h ago"); falls back to "just now" under a minute. */
export const relativeTime = (timestamp: number, now = Date.now()): string => {
  const diff = timestamp - now;
  for (const { unit, ms } of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
};

const absoluteFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeStyle: "short",
});

/** Full date and time, for tooltips and `dateTime` fallbacks. */
export const absoluteTime = (timestamp: number): string => absoluteFormatter.format(timestamp);

const mediumDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** Date alone for the reader header ("18 Sept 2026"), where the full form crowds the masthead. */
export const mediumDate = (timestamp: number): string => mediumDateFormatter.format(timestamp);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const shortDateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/** Compact age for a card chip: "now", "5m", "3h", "2d", "3w", then "Mar 4" (year when not this one). */
export const shortRelativeTime = (timestamp: number, now = Date.now()): string => {
  const age = now - timestamp;
  if (age < MINUTE) return "now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h`;
  if (age < WEEK) return `${Math.floor(age / DAY)}d`;
  if (age < 5 * WEEK) return `${Math.floor(age / WEEK)}w`;

  const date = new Date(timestamp);
  const short = shortDateFormatter.format(date);
  const year = date.getFullYear();
  return year === new Date(now).getFullYear() ? short : `${short}, ${year}`;
};
