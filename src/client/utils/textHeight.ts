import { decodeEntities } from "client/utils/html";

// Design B1, an image-less card. The tile CSS reads these too, so the estimate and the render agree.
const TEXT_CARD_PADDING_TOP = 8;
const TEXT_CARD_PADDING_X = 12;
const TEXT_CARD_PADDING_BOTTOM = 14;
const TEXT_CARD_PILL_HEIGHT = 20;
const TEXT_CARD_PILL_GAP = 16;
const TEXT_CARD_FEED_ROW_HEIGHT = 14;
const TEXT_CARD_RULE_MARGIN_TOP = 6;
const TEXT_CARD_RULE_HEIGHT = 2;
const TEXT_CARD_RULE_MARGIN_BOTTOM = 8;
const TEXT_CARD_TITLE_FONT_SIZE = 19;
const TEXT_CARD_TITLE_LINE_HEIGHT = 1.2;
const TEXT_CARD_TITLE_TRACKING_EM = -0.01;
const TEXT_CARD_TITLE_MAX_LINES = 3;

const TEXT_CARD_CHROME =
  TEXT_CARD_PADDING_TOP +
  TEXT_CARD_PILL_HEIGHT +
  TEXT_CARD_PILL_GAP +
  TEXT_CARD_FEED_ROW_HEIGHT +
  TEXT_CARD_RULE_MARGIN_TOP +
  TEXT_CARD_RULE_HEIGHT +
  TEXT_CARD_RULE_MARGIN_BOTTOM +
  TEXT_CARD_PADDING_BOTTOM;

// A low estimate cuts the last line through the clamp, so measure against a slightly narrower box.
const WIDTH_SLACK = 4;
// Without a canvas: a bold Latin glyph is under 0.6em on average, a CJK one is a full em.
const FALLBACK_GLYPH_EM = 0.6;
const FALLBACK_FONT_FAMILY = "system-ui, sans-serif";

const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/u;
// CSS collapses and breaks only on these, so a no-break space (&nbsp;) keeps its word together.
const BLANK = " \\t\\n\\r\\f";
const TRIM_BLANKS = new RegExp(`^[${BLANK}]+|[${BLANK}]+$`, "g");
const CJK_CLOSING = "。、」』）〉》】〕〗〙〛，．！？：；］｝｡､｣";
// A break opportunity after each run of blanks, after a hyphen not followed by a digit ("COVID-19"
// stays whole), and around every CJK character, whose closing punctuation sticks to the one before.
const SEGMENT = new RegExp(
  `[⺀-鿿가-힯豈-﫿＀-￯][${CJK_CLOSING}]*|(?:-(?=\\d)|[^${BLANK}\\-⺀-鿿가-힯豈-﫿＀-￯])*(?:-+(?!\\d)|[${BLANK}]+)?`,
  "gu",
);

type Measure = (text: string) => number;

let context: OffscreenCanvasRenderingContext2D | null | undefined;

const canvasMeasure = (): Measure | undefined => {
  if (context === undefined) {
    context =
      typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(1, 1).getContext("2d");
    if (context) {
      const family =
        typeof document === "undefined"
          ? ""
          : getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
      context.font = `bold ${TEXT_CARD_TITLE_FONT_SIZE}px ${family || FALLBACK_FONT_FAMILY}`;
      if ("letterSpacing" in context) {
        context.letterSpacing = `${TEXT_CARD_TITLE_FONT_SIZE * TEXT_CARD_TITLE_TRACKING_EM}px`;
      }
    }
  }
  const ctx = context;
  return ctx ? (text) => ctx.measureText(text).width : undefined;
};

const estimateMeasure: Measure = (text) => {
  let ems = 0;
  for (const char of text) ems += CJK.test(char) ? 1 : FALLBACK_GLYPH_EM;
  return ems * TEXT_CARD_TITLE_FONT_SIZE;
};

const segmentsOf = (text: string): string[] => text.match(SEGMENT)?.filter(Boolean) ?? [];

const titleLines = ({ text, width }: { text: string; width: number }): number => {
  const measure = canvasMeasure() ?? estimateMeasure;
  const available = width - 2 * TEXT_CARD_PADDING_X - WIDTH_SLACK;
  let lines = 1;
  let line = "";
  for (const segment of segmentsOf(text.replace(TRIM_BLANKS, ""))) {
    const candidate = line + segment;
    // Trailing spaces hang past the edge, so they never force a wrap.
    if (line !== "" && measure(candidate.replace(TRIM_BLANKS, "")) > available) {
      lines += 1;
      if (lines >= TEXT_CARD_TITLE_MAX_LINES) return TEXT_CARD_TITLE_MAX_LINES;
      line = segment;
    } else {
      line = candidate;
    }
  }
  return lines;
};

let cachedWidth: number | undefined;
const linesCache = new Map<string, number>();

export const textCardHeight = ({
  title,
  untitled,
  width,
}: {
  title: string | undefined;
  untitled: string;
  width: number;
}): number => {
  if (width !== cachedWidth) {
    linesCache.clear();
    cachedWidth = width;
  }
  const key = title ? `${width}|${title}` : `${width}|\0${untitled}`;
  let lines = linesCache.get(key);
  if (lines === undefined) {
    lines = titleLines({ text: title ? decodeEntities(title) : untitled, width });
    linesCache.set(key, lines);
  }
  return TEXT_CARD_CHROME + lines * TEXT_CARD_TITLE_FONT_SIZE * TEXT_CARD_TITLE_LINE_HEIGHT;
};
