import { describe, expect, it } from "vitest";
import { layoutMasonry, neighbourOf, tileAspect, type MasonryItem } from "../masonry";

const MIN_ASPECT = 1;
const MAX_ASPECT = 16 / 9;
const TEXT_ASPECT = 16 / 9;

const squares = (count: number): MasonryItem[] =>
  Array.from({ length: count }, (_, i) => ({ id: `i${i}`, aspect: 1 }));

// Two columns of 394px at 800. a is tall, so items 2-4 all stack in the shorter right column.
const stacked: MasonryItem[] = [
  { id: "a", aspect: 3 / 4 },
  { id: "b", aspect: 16 / 9 },
  { id: "c", aspect: 16 / 9 },
  { id: "d", aspect: 1 },
];

describe("masonry", () => {
  describe("when sizing a tile", () => {
    it("clamps a very tall image up to MIN_ASPECT", () => {
      expect(tileAspect({ visual: { url: "i.jpg", width: 600, height: 1200 } })).toBe(MIN_ASPECT);
    });

    it("clamps a very wide image down to MAX_ASPECT", () => {
      expect(tileAspect({ visual: { url: "i.jpg", width: 2000, height: 500 } })).toBe(MAX_ASPECT);
    });

    it("keeps an aspect already inside the range", () => {
      expect(tileAspect({ visual: { url: "i.jpg", width: 1200, height: 800 } })).toBe(1.5);
    });

    it("falls back to TEXT_ASPECT without a visual", () => {
      expect(tileAspect({})).toBe(TEXT_ASPECT);
      expect(tileAspect({ visual: undefined })).toBe(TEXT_ASPECT);
    });

    it("falls back to TEXT_ASPECT when the intrinsic size is missing or zero", () => {
      expect(tileAspect({ visual: { url: "i.jpg" } })).toBe(TEXT_ASPECT);
      expect(tileAspect({ visual: { url: "i.jpg", width: 800 } })).toBe(TEXT_ASPECT);
      expect(tileAspect({ visual: { url: "i.jpg", width: 0, height: 800 } })).toBe(TEXT_ASPECT);
      expect(tileAspect({ visual: { url: "i.jpg", width: 800, height: 0 } })).toBe(TEXT_ASPECT);
    });
  });

  describe("when sizing columns", () => {
    it("gives a narrow pane one full-width column", () => {
      const layout = layoutMasonry({ containerWidth: 388, items: squares(6) });
      expect(layout.columns).toBe(1);
      expect(layout.columnWidth).toBe(388);
      expect(layout.width).toBe(388);
      expect(layout.positions.get("i0")?.x).toBe(0);
    });

    it("flattens portrait cards to 4:3 when only one column fits", () => {
      const layout = layoutMasonry({
        containerWidth: 388,
        items: [
          { id: "tall", aspect: 0.75 },
          { id: "wide", aspect: 1.5 },
        ],
      });
      expect(layout.positions.get("tall")?.height).toBe(291);
      expect(layout.positions.get("wide")?.height).toBe(259);
    });

    it("caps a lone column at the maximum width and centres it", () => {
      const layout = layoutMasonry({ containerWidth: 700, items: squares(6) });
      expect(layout.columns).toBe(1);
      expect(layout.columnWidth).toBe(480);
      expect(layout.width).toBe(480);
      expect(layout.positions.get("i0")?.x).toBe(110);
    });

    it("fits two columns at 1100", () => {
      const layout = layoutMasonry({ containerWidth: 1100, items: squares(8) });
      expect(layout.columns).toBe(2);
      expect(layout.columnWidth).toBe(480);
      expect(layout.width).toBe(972);
    });

    it("fits five columns at 2000 and centres the leftover pixels", () => {
      const layout = layoutMasonry({ containerWidth: 2000, items: squares(20) });
      expect(layout.columns).toBe(5);
      expect(layout.columnWidth).toBe(390);
      expect(layout.width).toBe(1998);
      expect(layout.positions.get("i0")?.x).toBe(1);
    });

    it("stops at five columns on an ultrawide and centres the grid", () => {
      const layout = layoutMasonry({ containerWidth: 4000, items: squares(20) });
      expect(layout.columns).toBe(5);
      expect(layout.columnWidth).toBe(480);
      expect(layout.width).toBe(2448);
      expect(layout.positions.get("i0")?.x).toBe(776);
    });

    it("caps the column width at MAX_COLUMN_WIDTH and centres the grid", () => {
      const layout = layoutMasonry({ containerWidth: 2000, items: squares(3) });
      expect(layout.columns).toBe(3);
      expect(layout.columnWidth).toBe(480);
      expect(layout.width).toBe(1464);
      expect(layout.positions.get("i0")?.x).toBe(268);
      expect(layout.positions.get("i2")?.x).toBe(268 + 2 * 492);
    });

    it("uses fewer columns than fit when there are fewer items", () => {
      const layout = layoutMasonry({ containerWidth: 1100, items: squares(2) });
      expect(layout.columns).toBe(2);
      expect(layout.columnWidth).toBe(480);
      expect(layout.width).toBe(972);
      expect(layout.positions.get("i0")?.x).toBe(64);
      expect(layout.positions.get("i1")?.x).toBe(64 + 492);
    });

    it("keeps the fitting column count when there are no items", () => {
      const layout = layoutMasonry({ containerWidth: 1100, items: [] });
      expect(layout.columns).toBe(2);
      expect(layout.height).toBe(0);
      expect(layout.positions.size).toBe(0);
      expect(layout.columnItems).toEqual([[], []]);
    });

    it("treats a non-finite or negative width as zero", () => {
      for (const containerWidth of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
        const layout = layoutMasonry({ containerWidth, items: squares(4) });
        expect(layout.columns).toBe(1);
        expect(layout.columnWidth).toBe(0);
        expect(layout.width).toBe(0);
      }
    });
  });

  describe("when placing items", () => {
    it("places each item in the shortest column, ties to the left", () => {
      const layout = layoutMasonry({ containerWidth: 800, items: stacked });
      expect(layout.columnItems).toEqual([["a"], ["b", "c", "d"]]);
      expect(layout.positions.get("a")).toEqual({ x: 0, y: 0, width: 394, height: 525, column: 0 });
      expect(layout.positions.get("b")).toEqual({
        x: 406,
        y: 0,
        width: 394,
        height: 222,
        column: 1,
      });
      expect(layout.positions.get("c")?.y).toBe(234);
      expect(layout.positions.get("d")?.y).toBe(468);
    });

    it("gives an item with a fixed height that height, whatever its aspect", () => {
      const layout = layoutMasonry({
        containerWidth: 1100,
        items: [
          { id: "a", aspect: 1, height: 60 },
          { id: "b", aspect: 1 },
        ],
      });
      expect(layout.positions.get("a")?.height).toBe(60);
      expect(layout.positions.get("b")?.height).toBe(layout.columnWidth);
    });

    it("reports the tallest column height without a trailing gap", () => {
      const layout = layoutMasonry({ containerWidth: 800, items: stacked });
      expect(layout.height).toBe(862);
    });

    it("honours a custom gap", () => {
      const layout = layoutMasonry({ containerWidth: 800, items: stacked, gap: 0 });
      expect(layout.columnWidth).toBe(400);
      expect(layout.positions.get("b")?.x).toBe(400);
      expect(layout.positions.get("c")?.y).toBe(225);
    });
  });

  describe("when finding a neighbour", () => {
    const layout = layoutMasonry({ containerWidth: 800, items: stacked });

    it("walks up and down inside a column", () => {
      expect(neighbourOf({ layout, id: "c", direction: "up" })).toBe("b");
      expect(neighbourOf({ layout, id: "c", direction: "down" })).toBe("d");
    });

    it("returns undefined at the top and bottom of a column", () => {
      expect(neighbourOf({ layout, id: "b", direction: "up" })).toBeUndefined();
      expect(neighbourOf({ layout, id: "d", direction: "down" })).toBeUndefined();
      expect(neighbourOf({ layout, id: "a", direction: "up" })).toBeUndefined();
      expect(neighbourOf({ layout, id: "a", direction: "down" })).toBeUndefined();
    });

    it("returns undefined past the left and right edges", () => {
      expect(neighbourOf({ layout, id: "a", direction: "left" })).toBeUndefined();
      expect(neighbourOf({ layout, id: "d", direction: "right" })).toBeUndefined();
    });

    it("picks the horizontal neighbour with the closest vertical centre", () => {
      expect(neighbourOf({ layout, id: "a", direction: "right" })).toBe("c");
      expect(neighbourOf({ layout, id: "b", direction: "left" })).toBe("a");
      expect(neighbourOf({ layout, id: "d", direction: "left" })).toBe("a");
    });

    it("breaks a centre tie towards the upper item", () => {
      // 360px columns, no gap: a spans 0-480 (centre 240), b 0-240 (centre 120), c 240-480 (360).
      const tied = layoutMasonry({
        containerWidth: 720,
        gap: 0,
        items: [
          { id: "a", aspect: 3 / 4 },
          { id: "b", aspect: 1.5 },
          { id: "c", aspect: 1.5 },
        ],
      });
      expect(tied.columnItems).toEqual([["a"], ["b", "c"]]);
      expect(neighbourOf({ layout: tied, id: "a", direction: "right" })).toBe("b");
    });

    it("returns undefined for an unknown id", () => {
      expect(neighbourOf({ layout, id: "nope", direction: "down" })).toBeUndefined();
    });
  });
});
