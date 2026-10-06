import { afterEach, describe, expect, it, vi } from "vitest";

// 390 wide leaves 362px for the title. The jsdom fallback counts 11.4px a Latin glyph, so 31 fit.
const WIDTH = 390;
const ONE_LINE = 111;
const TWO_LINES = 134;
const THREE_LINES = 156;

const load = async () => import("../textHeight");

const CHROME = 88;
const LINE_HEIGHT = 19 * 1.2;

const loadTitleLines = async () => {
  const { textCardHeight } = await load();
  return ({ text, width }: { text: string; width: number }) =>
    Math.round((textCardHeight({ title: text, untitled: "", width }) - CHROME) / LINE_HEIGHT);
};

const words = (count: number): string => Array.from({ length: count }, () => "word").join(" ");

describe("textHeight", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe("when no canvas exists", () => {
    it("counts one, two and three lines", async () => {
      const titleLines = await loadTitleLines();
      expect(titleLines({ text: words(6), width: WIDTH })).toBe(1);
      expect(titleLines({ text: words(10), width: WIDTH })).toBe(2);
      expect(titleLines({ text: words(16), width: WIDTH })).toBe(3);
    });

    it("clamps a longer title to three lines", async () => {
      const titleLines = await loadTitleLines();
      expect(titleLines({ text: words(80), width: WIDTH })).toBe(3);
    });

    it("breaks after a hyphen", async () => {
      const titleLines = await loadTitleLines();
      expect(titleLines({ text: `${"a".repeat(20)}-${"b".repeat(20)}`, width: WIDTH })).toBe(2);
      expect(titleLines({ text: `${"a".repeat(20)}${"b".repeat(20)}`, width: WIDTH })).toBe(1);
    });

    it("keeps a no-break space with its word", async () => {
      const titleLines = await loadTitleLines();
      const text = (gap: string) =>
        `${"a".repeat(20)} ${"b".repeat(10)}${gap}${"c".repeat(10)} ${"e".repeat(15)}`;
      expect(titleLines({ text: text(" "), width: WIDTH })).toBe(2);
      expect(titleLines({ text: text("&nbsp;"), width: WIDTH })).toBe(3);
    });

    it("does not break after a hyphen before a digit", async () => {
      const titleLines = await loadTitleLines();
      expect(titleLines({ text: `${"a".repeat(20)}-${"1".repeat(20)}`, width: WIDTH })).toBe(1);
    });

    it("keeps CJK closing punctuation off the start of a line", async () => {
      const titleLines = await loadTitleLines();
      // The full stop moves down with the character before it, which pushes the last one to a third line.
      expect(titleLines({ text: `${"日".repeat(19)}。${"日".repeat(18)}`, width: WIDTH })).toBe(3);
    });

    it("breaks CJK between any two characters, a full em each", async () => {
      const titleLines = await loadTitleLines();
      // 19px a character: 19 fit on a line.
      expect(titleLines({ text: "日".repeat(19), width: WIDTH })).toBe(1);
      expect(titleLines({ text: "日".repeat(20), width: WIDTH })).toBe(2);
    });

    it("adds the chrome to the title lines", async () => {
      const { textCardHeight } = await load();
      const height = (title: string) =>
        Math.round(textCardHeight({ title, untitled: "(untitled)", width: WIDTH }));
      expect(height(words(6))).toBe(ONE_LINE);
      expect(height(words(10))).toBe(TWO_LINES);
      expect(height(words(80))).toBe(THREE_LINES);
    });

    it("measures the decoded title", async () => {
      const { textCardHeight } = await load();
      // 26 characters once decoded, 46 escaped.
      const title = "&amp;&amp;&amp;&amp;&amp; abcdefghijklmnopqrst";
      expect(Math.round(textCardHeight({ title, untitled: "", width: WIDTH }))).toBe(ONE_LINE);
    });

    it("measures the untitled fallback for an empty title", async () => {
      const { textCardHeight } = await load();
      expect(Math.round(textCardHeight({ title: "", untitled: "(untitled)", width: WIDTH }))).toBe(
        ONE_LINE,
      );
      expect(
        Math.round(textCardHeight({ title: undefined, untitled: words(10), width: WIDTH })),
      ).toBe(TWO_LINES);
    });

    it("recounts the lines when the width changes", async () => {
      const { textCardHeight } = await load();
      const title = words(10);
      expect(Math.round(textCardHeight({ title, untitled: "", width: WIDTH }))).toBe(TWO_LINES);
      expect(Math.round(textCardHeight({ title, untitled: "", width: 800 }))).toBe(ONE_LINE);
      expect(Math.round(textCardHeight({ title, untitled: "", width: WIDTH }))).toBe(TWO_LINES);
    });
  });

  describe("when a canvas exists", () => {
    const stubCanvas = () => {
      const context = {
        font: "",
        letterSpacing: "",
        measureText: vi.fn<(text: string) => { width: number }>((text) => ({
          width: text.length * 10,
        })),
      };
      vi.stubGlobal(
        "OffscreenCanvas",
        class {
          getContext() {
            return context;
          }
        },
      );
      return context;
    };

    it("wraps on the measured width", async () => {
      stubCanvas();
      const titleLines = await loadTitleLines();
      // 10px a glyph: 36 fit in 362px.
      expect(titleLines({ text: "a".repeat(17) + " " + "b".repeat(18), width: WIDTH })).toBe(1);
      expect(titleLines({ text: "a".repeat(18) + " " + "b".repeat(18), width: WIDTH })).toBe(2);
      expect(titleLines({ text: words(40), width: WIDTH })).toBe(3);
    });

    it("sets the bold title font and its tracking", async () => {
      const context = stubCanvas();
      const titleLines = await loadTitleLines();
      titleLines({ text: "Title", width: WIDTH });
      expect(context.font).toMatch(/^bold 19px /);
      expect(context.letterSpacing).toBe("-0.19px");
    });

    it("caches a title per width", async () => {
      const context = stubCanvas();
      const { textCardHeight } = await load();
      textCardHeight({ title: "Same title", untitled: "", width: WIDTH });
      const calls = context.measureText.mock.calls.length;
      textCardHeight({ title: "Same title", untitled: "", width: WIDTH });
      expect(context.measureText.mock.calls.length).toBe(calls);
    });
  });
});
