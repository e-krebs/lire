import { describe, expect, it } from "vitest";
import { readingTime } from "../readingTime";

const words = (count: number): string => Array.from({ length: count }, () => "word").join(" ");

describe("readingTime", () => {
  it("returns 0 for an empty body", () => {
    expect(readingTime("")).toBe(0);
    expect(readingTime("   \n  ")).toBe(0);
  });

  it("rounds to the nearest minute", () => {
    expect(readingTime(words(100))).toBe(0);
    expect(readingTime(words(229))).toBe(1);
    expect(readingTime(words(460))).toBe(2);
  });

  it("counts words across any run of whitespace", () => {
    expect(readingTime(" one\ntwo\t three  four ")).toBe(0);
    expect(readingTime(words(230).replaceAll(" ", "\n"))).toBe(1);
  });
});
