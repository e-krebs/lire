import { describe, expect, it } from "vitest";
import { sunPhase } from "../sun";
import { TIMEZONE_COORDINATES } from "../timezones.gen";

const PARIS = { lat: 48.8567, lon: 2.3508 };
const TROMSO = { lat: 69.6496, lon: 18.956 };
const TOLERANCE_MS = 2 * 60_000;

const expectWithin = ({ actual, expected }: { actual: Date; expected: string }) => {
  expect(Math.abs(actual.getTime() - new Date(expected).getTime())).toBeLessThanOrEqual(
    TOLERANCE_MS,
  );
};

describe("sunPhase", () => {
  describe("when it is night in Paris at the summer solstice", () => {
    it("answers dusk until the sunrise", () => {
      const result = sunPhase({ at: new Date("2026-06-21T00:00:00Z"), ...PARIS });
      expect(result.phase).toBe("dusk");
      expectWithin({ actual: result.nextChangeAt, expected: "2026-06-21T03:47:00Z" });
    });
  });

  describe("when it is day in Paris at the summer solstice", () => {
    it("answers day until the sunset", () => {
      const result = sunPhase({ at: new Date("2026-06-21T12:00:00Z"), ...PARIS });
      expect(result.phase).toBe("day");
      expectWithin({ actual: result.nextChangeAt, expected: "2026-06-21T19:58:00Z" });
    });
  });

  describe("when it is night in Paris at the winter solstice", () => {
    it("answers dusk until the sunrise", () => {
      const result = sunPhase({ at: new Date("2026-12-21T00:00:00Z"), ...PARIS });
      expect(result.phase).toBe("dusk");
      expectWithin({ actual: result.nextChangeAt, expected: "2026-12-21T07:41:00Z" });
    });
  });

  describe("when it is day in Paris at the winter solstice", () => {
    it("answers day until the sunset", () => {
      const result = sunPhase({ at: new Date("2026-12-21T12:00:00Z"), ...PARIS });
      expect(result.phase).toBe("day");
      expectWithin({ actual: result.nextChangeAt, expected: "2026-12-21T15:56:00Z" });
    });
  });

  describe("when the instant is just before sunrise", () => {
    it("answers dusk with the change at that sunrise", () => {
      const sunrise = sunPhase({ at: new Date("2026-06-21T00:00:00Z"), ...PARIS }).nextChangeAt;
      const result = sunPhase({ at: new Date(sunrise.getTime() - 60_000), ...PARIS });
      expect(result.phase).toBe("dusk");
      expect(Math.abs(result.nextChangeAt.getTime() - sunrise.getTime())).toBeLessThanOrEqual(2000);
    });
  });

  describe("when it is polar night in Tromsø", () => {
    it("answers dusk and checks again in 6 hours", () => {
      const at = new Date("2026-12-21T12:00:00Z");
      const result = sunPhase({ at, ...TROMSO });
      expect(result.phase).toBe("dusk");
      expect(result.nextChangeAt.getTime() - at.getTime()).toBe(6 * 3_600_000);
    });
  });

  describe("when the coordinates come from the time zone table", () => {
    it("matches Paris for Europe/Paris and keeps aliases", () => {
      expect(TIMEZONE_COORDINATES["Europe/Paris"]).toEqual({ lat: 48.87, lon: 2.33 });
      expect(TIMEZONE_COORDINATES["Asia/Calcutta"]).toEqual(TIMEZONE_COORDINATES["Asia/Kolkata"]);
    });
  });
});
