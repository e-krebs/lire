import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepCards } from "client/components/app/auth/landing/StepCards";

const ui = {
  get newsblurLink() {
    return screen.getByRole("link", { name: "Visit NewsBlur" });
  },
  get steps() {
    return screen.getByRole("list", { name: "How it works, in three steps" });
  },
  get stepItems() {
    return this.steps.querySelectorAll(":scope > li:not([aria-hidden])");
  },
  get hiddenItems() {
    return this.steps.querySelectorAll('li[aria-hidden="true"]');
  },
  get decorativeLogo() {
    return document.querySelector('img[alt=""]');
  },
  get titles() {
    return [
      screen.getByText("Your feeds live in NewsBlur"),
      screen.getByText("You read and manage them in Lire"),
      screen.getByText("Your read state syncs back"),
    ];
  },
};

describe("StepCards", () => {
  it("renders the three step titles", () => {
    render(<StepCards />);

    expect(ui.stepItems).toHaveLength(3);
    for (const title of ui.titles) expect(title).toBeInTheDocument();
  });

  it("links to NewsBlur in a new tab", () => {
    render(<StepCards />);

    expect(ui.newsblurLink).toHaveAttribute("href", "https://newsblur.com");
    expect(ui.newsblurLink).toHaveAttribute("target", "_blank");
    expect(ui.newsblurLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("hides the decorative logo and arrows from assistive tech", () => {
    render(<StepCards />);

    expect(ui.decorativeLogo).toBeInTheDocument();
    expect(ui.hiddenItems).toHaveLength(2);
  });
});
