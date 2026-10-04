import { describe, expect, it } from "vitest";
import { absoluteTime, mediumDate, relativeTime, shortRelativeTime } from "../time";

const NOW = Date.UTC(2026, 8, 20, 12, 0, 0); // 2026-09-20T12:00:00Z

const ago = (ms: number, locale: "en" | "fr" = "en") =>
  shortRelativeTime({ timestamp: NOW - ms, locale, now: NOW });

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe("time", () => {
  describe("when formatting a relative time", () => {
    it('reads "now" under a minute', () => {
      expect(ago(0)).toBe("now");
      expect(ago(59 * SECOND)).toBe("now");
    });

    it("counts whole minutes under an hour", () => {
      expect(ago(MINUTE)).toBe("1m");
      expect(ago(5 * MINUTE + 59 * SECOND)).toBe("5m");
      expect(ago(59 * MINUTE)).toBe("59m");
    });

    it("counts whole hours under a day", () => {
      expect(ago(HOUR)).toBe("1h");
      expect(ago(3 * HOUR + 45 * MINUTE)).toBe("3h");
      expect(ago(23 * HOUR)).toBe("23h");
    });

    it("counts whole days under a week", () => {
      expect(ago(DAY)).toBe("1d");
      expect(ago(2 * DAY + 20 * HOUR)).toBe("2d");
      expect(ago(6 * DAY)).toBe("6d");
    });

    it("counts whole weeks up to five", () => {
      expect(ago(WEEK)).toBe("1w");
      expect(ago(3 * WEEK + 2 * DAY)).toBe("3w");
      expect(ago(4 * WEEK)).toBe("4w");
    });

    it("falls back to a short date past five weeks", () => {
      expect(ago(5 * WEEK)).toBe("Aug 16");
    });

    it("adds the year when it differs from now's", () => {
      expect(
        shortRelativeTime({
          timestamp: Date.UTC(2025, 2, 4, 12, 0, 0),
          locale: "en",
          now: NOW,
        }),
      ).toBe("Mar 4, 2025");
    });

    it('treats a future timestamp as "now"', () => {
      expect(ago(-5 * MINUTE)).toBe("now");
    });
  });

  describe("when formatting a relative time in French", () => {
    it("uses the French words and units", () => {
      expect(ago(0, "fr")).toBe("maintenant");
      expect(ago(5 * MINUTE, "fr")).toBe("5 min");
      expect(ago(3 * HOUR, "fr")).toBe("3 h");
      expect(ago(2 * DAY, "fr")).toBe("2 j");
      expect(ago(3 * WEEK, "fr")).toBe("3 sem");
    });

    it("puts the day before the month in a short date", () => {
      expect(ago(5 * WEEK, "fr")).toBe("16 août");
      expect(
        shortRelativeTime({
          timestamp: Date.UTC(2025, 2, 4, 12, 0, 0),
          locale: "fr",
          now: NOW,
        }),
      ).toBe("4 mars 2025");
    });
  });

  describe("when formatting a list-row relative time", () => {
    it('reads "just now" under a minute', () => {
      expect(relativeTime({ timestamp: NOW - 30 * SECOND, locale: "en", now: NOW })).toBe(
        "just now",
      );
      expect(relativeTime({ timestamp: NOW - 30 * SECOND, locale: "fr", now: NOW })).toBe(
        "à l'instant",
      );
    });

    it("names the largest whole unit in the locale", () => {
      expect(relativeTime({ timestamp: NOW - 3 * MINUTE, locale: "en", now: NOW })).toBe(
        "3 minutes ago",
      );
      expect(relativeTime({ timestamp: NOW - 3 * HOUR, locale: "fr", now: NOW })).toBe(
        "il y a 3 heures",
      );
    });

    it('clamps a future timestamp to "just now"', () => {
      for (const offset of [2 * MINUTE, 3 * HOUR]) {
        expect(relativeTime({ timestamp: NOW + offset, locale: "en", now: NOW })).toBe("just now");
        expect(relativeTime({ timestamp: NOW + offset, locale: "fr", now: NOW })).toBe(
          "à l'instant",
        );
      }
    });
  });

  describe("when formatting an absolute time", () => {
    it("writes the date and time in the locale", () => {
      const timestamp = Date.UTC(2026, 8, 18, 14, 5);
      expect(absoluteTime({ timestamp, locale: "en" })).toBe("September 18, 2026 at 2:05 PM");
      expect(absoluteTime({ timestamp, locale: "fr" })).toBe("18 septembre 2026 à 14:05");
    });
  });

  describe("when formatting a medium date", () => {
    it("names the day, month and year without a time", () => {
      expect(mediumDate({ timestamp: Date.UTC(2026, 8, 18, 12), locale: "en" })).toBe(
        "Sep 18, 2026",
      );
    });

    it("puts the day first in French", () => {
      expect(mediumDate({ timestamp: Date.UTC(2026, 8, 18, 12), locale: "fr" })).toBe(
        "18 sept. 2026",
      );
    });
  });
});
