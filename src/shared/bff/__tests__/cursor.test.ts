import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../cursor";

describe("cursor", () => {
  it("round-trips a page and a non-ASCII query as base64url", () => {
    const token = encodeCursor({ page: 3, q: "café ~~ ??" });
    expect(token).toMatch(/^[\w-]+$/);
    expect(decodeCursor(token)).toEqual({ page: 3, q: "café ~~ ??" });
  });

  it("rejects a token that is not base64", () => {
    expect(decodeCursor("%%%")).toBeNull();
  });

  it("rejects base64 that is not JSON", () => {
    expect(decodeCursor(btoa("nope"))).toBeNull();
  });

  it("rejects JSON of the wrong shape", () => {
    expect(decodeCursor(btoa(JSON.stringify({ page: 0 })))).toBeNull();
  });
});
