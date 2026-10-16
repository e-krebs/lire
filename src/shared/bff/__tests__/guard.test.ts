import { describe, expect, it } from "vitest";
import { hasBanPayload } from "../guard";

describe("hasBanPayload", () => {
  it("finds a ban sequence in a nested string", () => {
    expect(hasBanPayload({ params: { id: "x" }, body: [{ title: "a<script>" }] })).toBe(true);
  });

  it.for(["<script>", "<SCRIPT src=x", "<Script"])("matches %s in any case", (value) => {
    expect(hasBanPayload(value)).toBe(true);
  });

  it("finds a ban sequence in an object key", () => {
    expect(hasBanPayload({ "lire.<script>": "ok" })).toBe(true);
    expect(hasBanPayload({ body: { "../../../x": 1 } })).toBe(true);
  });

  it("matches the ../../../ traversal sequence", () => {
    expect(hasBanPayload("/feeds/../../../etc")).toBe(true);
  });

  it("lets a lone ../ through", () => {
    expect(hasBanPayload("../feed")).toBe(false);
  });

  it("lets clean input through", () => {
    expect(hasBanPayload({ query: { q: "news" }, body: { n: 3, list: ["a"], flag: null } })).toBe(
      false,
    );
  });
});
