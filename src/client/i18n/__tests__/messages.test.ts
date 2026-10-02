import { describe, expect, it } from "vitest";
import { catalogs } from "../messages";

// A function message takes one object: `count` gets each sample, any other key a string.
const sampleArgs = (count: number) =>
  new Proxy<Record<string, unknown>>(
    { count },
    { get: (target, key) => (typeof key === "string" && key in target ? target[key] : "sample") },
  );

const leaves = (node: object, path: string[] = []): { path: string; value: unknown }[] =>
  Object.entries(node).flatMap(([key, value]: [string, unknown]) =>
    typeof value === "object" && value !== null
      ? leaves(value, [...path, key])
      : [{ path: [...path, key].join("."), value }],
  );

const render = (value: unknown): unknown[] =>
  typeof value === "function"
    ? [0, 1, 2].map((count): unknown => Reflect.apply(value, undefined, [sampleArgs(count)]))
    : [value];

describe("catalogs", () => {
  describe.each(Object.entries(catalogs))("when the locale is %s", (_locale, catalog) => {
    it("renders every message as a non-empty string", () => {
      const empty = leaves(catalog).filter(({ value }) =>
        render(value).some((text) => typeof text !== "string" || text.length === 0),
      );
      expect(empty.map(({ path }) => path)).toEqual([]);
    });
  });

  describe("when comparing locales", () => {
    it("gives French every English key", () => {
      expect(leaves(catalogs.fr).map(({ path }) => path)).toEqual(
        leaves(catalogs.en).map(({ path }) => path),
      );
    });
  });
});
