import { expect, test, type Page } from "./fixtures";

const ui = (page: Page) => ({
  get demoBanner() {
    return page.getByRole("status").filter({ hasText: "Demo with sample data." });
  },
  get entriesRegion() {
    return page.getByRole("region", { name: "Entries" });
  },
  get signInLink() {
    return page.getByRole("link", { name: "Sign in", exact: true });
  },
});

test.describe("the demo", () => {
  test("shows its banner, never the sign-in screen", async ({ page }) => {
    const pageUi = ui(page);
    await page.goto("/");

    await expect(pageUi.demoBanner).toBeVisible();
    await expect(pageUi.entriesRegion).toBeVisible();
    await expect(pageUi.signInLink).toHaveCount(0);
  });
});
