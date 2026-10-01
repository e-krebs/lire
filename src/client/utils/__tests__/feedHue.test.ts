import { describe, expect, it } from "vitest";
import { feedHue } from "../feedHue";

const FEED = "feed/https://example.test/rss";

const SAMPLE = Array.from({ length: 200 }, (_, index) => `feed/https://example.test/${index}/rss`);

describe("feedHue", () => {
  it("gives a feed the same hue every time", () => {
    expect(feedHue(FEED)).toBe(feedHue(FEED));
  });

  it("stays on the wheel, on a step of the set", () => {
    for (const hue of SAMPLE.map(feedHue)) {
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
      expect(hue % 20).toBe(0);
    }
  });

  // The whole point of the set: a wider one means two feeds share a colour less often.
  it("reaches every hue of the set over enough feeds", () => {
    expect(new Set(SAMPLE.map(feedHue)).size).toBe(18);
  });
});
