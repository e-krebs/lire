import { describe, expect, it } from "vitest";
import { decodeEntities } from "../html";

describe("decodeEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("données&nbsp;: A &amp; B &#39;c&#39;")).toBe("données : A & B 'c'");
  });

  it("leaves plain text alone", () => {
    expect(decodeEntities("Plain title")).toBe("Plain title");
  });
});
