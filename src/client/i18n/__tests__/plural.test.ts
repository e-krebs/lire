import { describe, expect, it } from "vitest";
import { pluralFor } from "../plural";

const forms = {
  one: (count: number) => `${count} flux`,
  other: (count: number) => `${count} fluxes`,
};

describe("pluralFor", () => {
  describe("when the locale is French", () => {
    it("reads 0 and 1 as singular", () => {
      const plural = pluralFor("fr");
      expect(plural({ count: 0, ...forms })).toBe("0 flux");
      expect(plural({ count: 1, ...forms })).toBe("1 flux");
      expect(plural({ count: 2, ...forms })).toBe("2 fluxes");
    });
  });

  describe("when the locale is English", () => {
    it("reads 0 as plural and 1 as singular", () => {
      const plural = pluralFor("en");
      expect(plural({ count: 0, ...forms })).toBe("0 fluxes");
      expect(plural({ count: 1, ...forms })).toBe("1 flux");
    });
  });
});
