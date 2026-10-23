import { describe, expect, it } from "vitest";
import { buildLibraries } from "../buildLibraries";

const MIT = { license: "MIT" };
const TANSTACK = { pattern: /^@tanstack\//, label: "TanStack", homepage: "https://tanstack.com" };

describe("buildLibraries", () => {
  it("collapses a group into one line with the group's label and homepage", () => {
    const libraries = buildLibraries({
      packages: {
        "@tanstack/react-router": { ...MIT, homepage: "https://tanstack.com/router" },
        "@tanstack/react-query": { ...MIT, homepage: "https://tanstack.com/query" },
      },
      groups: [TANSTACK],
      labels: {},
    });
    expect(libraries).toEqual([
      { label: "TanStack", license: "MIT", homepage: "https://tanstack.com" },
    ]);
  });

  it("applies label overrides and omits a missing homepage", () => {
    const libraries = buildLibraries({
      packages: {
        zod: MIT,
        dompurify: { license: "MPL-2.0 OR Apache-2.0", homepage: "https://x.test" },
      },
      groups: [],
      labels: { dompurify: "DOMPurify" },
    });
    expect(libraries).toEqual([
      { label: "DOMPurify", license: "MPL-2.0 OR Apache-2.0", homepage: "https://x.test" },
      { label: "zod", license: "MIT" },
    ]);
  });

  it("sorts lines case-insensitively by label", () => {
    const libraries = buildLibraries({
      packages: { react: MIT, jose: MIT, Zod: MIT },
      groups: [],
      labels: {},
    });
    expect(libraries.map((l) => l.label)).toEqual(["jose", "react", "Zod"]);
  });

  it("throws when the members of a group have different licences", () => {
    expect(() =>
      buildLibraries({
        packages: {
          "@tanstack/a": MIT,
          "@tanstack/b": { license: "Apache-2.0" },
        },
        groups: [TANSTACK],
        labels: {},
      }),
    ).toThrow("TanStack: members have different licences (MIT, Apache-2.0)");
  });
});
