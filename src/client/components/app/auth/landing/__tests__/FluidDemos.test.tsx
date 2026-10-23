import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FluidDemos } from "client/components/app/auth/landing/FluidDemos";

const MOTION_QUERY = "@media (prefers-reduced-motion: no-preference) {";

const ui = {
  get captions() {
    return screen
      .getAllByRole("figure")
      .map((figure) => figure.querySelector("figcaption")?.textContent);
  },
  get landingCss() {
    const css = readFileSync("src/client/styles.css", "utf8");
    return css.slice(css.indexOf("/* Signed-out landing"));
  },
};

describe("FluidDemos", () => {
  it("renders the three demo captions", () => {
    render(<FluidDemos />);

    expect(ui.captions).toEqual([
      "Read articles and newsletters",
      "Swipe a card to mark it read",
      "Drag categories to reorder them",
    ]);
  });

  it("keeps every demo animation under the reduced-motion query", () => {
    const { landingCss: css } = ui;
    const motionStart = css.indexOf(MOTION_QUERY);
    const motionEnd = css.indexOf("\n}\n", motionStart);
    const uses = [...css.matchAll(/animation: landing-/g)].map((match) => match.index);

    expect(motionStart).toBeGreaterThan(-1);
    expect(uses).toHaveLength(3);
    for (const use of uses) expect(use > motionStart && use < motionEnd).toBe(true);
  });
});
