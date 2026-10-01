import { describe, expect, it } from "vitest";
import { textSnippet } from "../html";

describe("textSnippet", () => {
  it("strips tags and collapses whitespace", () => {
    expect(textSnippet("<p>Hello   <b>world</b></p>")).toBe("Hello world");
  });

  it("removes script and style blocks entirely", () => {
    expect(textSnippet("<p>Keep</p><script>bad()</script>")).toBe("Keep");
  });

  it("returns an empty string for undefined input", () => {
    expect(textSnippet(undefined)).toBe("");
  });
});
