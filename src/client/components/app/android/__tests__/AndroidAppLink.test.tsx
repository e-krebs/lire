import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AndroidAppLink } from "client/components/app/android/AndroidAppLink";

const ui = {
  get link() {
    return screen.queryByRole("link", { name: "Get the Android app" });
  },
};

describe("AndroidAppLink", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("links to the Play Store in an Android browser", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 14) Chrome/130",
    );
    render(<AndroidAppLink />);

    const link = ui.link;
    expect(link).toHaveAttribute(
      "href",
      "https://play.google.com/store/apps/details?id=tech.krebs.lire",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders nothing on desktop", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh) Safari/605");
    const { container } = render(<AndroidAppLink />);

    expect(ui.link).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
