import { describe, expect, it } from "vitest";
import { shortRelativeTime, mediumDate } from "../time";

const NOW = Date.UTC(2026, 8, 20, 12, 0, 0); // 2026-09-20T12:00:00Z

const ago = (ms: number) => shortRelativeTime(NOW - ms, NOW);

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
      expect(shortRelativeTime(Date.UTC(2025, 2, 4, 12, 0, 0), NOW)).toBe("Mar 4, 2025");
    });

    it('treats a future timestamp as "now"', () => {
      expect(ago(-5 * MINUTE)).toBe("now");
    });
  });

  describe("when formatting a medium date", () => {
    it("names the day, month and year without a time", () => {
      const text = mediumDate(Date.UTC(2026, 8, 18, 12));
      expect(text).toContain("2026");
      expect(text).toContain("18");
      expect(text).not.toMatch(/\d:\d\d/);
    });
  });
});
