import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Credits } from "client/components/app/credits/Credits";
import { LIBRARIES } from "client/components/app/credits/libraries";

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14) Chrome/130";
const DESKTOP_UA = "Mozilla/5.0 (Macintosh) Safari/605";

const renderCredits = async ({ signedOut }: { signedOut: boolean }) => {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <Credits signedOut={signedOut} /> }),
    history: createMemoryHistory({ initialEntries: ["/credits"] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
};

const ui = {
  get cardHeadings() {
    return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
  },
  get backLink() {
    return screen.queryByRole("link", { name: "Back to sign in" });
  },
  get externalLinks() {
    return screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("https://"));
  },
  get androidLink() {
    return screen.queryByRole("link", { name: "Get the Android app" });
  },
  libraryRow(label: string) {
    return screen.getByText(label);
  },
  get version() {
    return screen.getByText(`Lire ${import.meta.env.VITE_APP_VERSION ?? "dev"}`);
  },
};

describe("Credits", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the NewsBlur, Lire and Libraries cards in order", async () => {
    await renderCredits({ signedOut: false });

    expect(ui.cardHeadings).toEqual(["NewsBlur", "Lire", "Open-source libraries"]);
    for (const library of LIBRARIES) {
      expect(ui.libraryRow(library.label)).toBeInTheDocument();
    }
    expect(ui.version).toBeInTheDocument();
  });

  it("opens every external link in a new tab with rel noopener noreferrer", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID_UA);
    await renderCredits({ signedOut: false });

    expect(ui.externalLinks.length).toBeGreaterThan(0);
    for (const link of ui.externalLinks) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("shows the back link only when signed out", async () => {
    const { unmount } = await renderCredits({ signedOut: false });
    expect(ui.backLink).toBeNull();
    unmount();

    await renderCredits({ signedOut: true });
    expect(ui.backLink).toHaveAttribute("href", "/");
  });

  it("shows the Android app link in an Android browser", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID_UA);
    await renderCredits({ signedOut: false });

    expect(ui.androidLink).toHaveAttribute("target", "_blank");
    expect(ui.androidLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("hides the Android app link on desktop", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(DESKTOP_UA);
    await renderCredits({ signedOut: false });

    expect(ui.androidLink).toBeNull();
  });
});
