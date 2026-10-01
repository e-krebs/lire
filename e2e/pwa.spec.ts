import { expect, test, type Page } from "./fixtures";

const ui = (page: Page) => ({
  get entriesRegion() {
    return page.getByRole("region", { name: "Entries" });
  },
});

test.describe("the service worker", () => {
  test("serves the shell offline and leaves /api to the network", async ({ page, context }) => {
    const pageUi = ui(page);
    await page.goto("/");
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    // `vite preview` answers /api/auth/login with index.html itself, so only the response's origin
    // shows the denylist at work.
    const login = await page.goto("/api/auth/login");
    expect(login?.fromServiceWorker()).toBe(false);
    const shell = await page.goto("/");
    expect(shell?.fromServiceWorker()).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(pageUi.entriesRegion).toBeVisible();

    await expect(page.goto("/api/auth/login")).rejects.toThrow();
  });
});
