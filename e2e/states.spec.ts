import { expect, test as base, type Page } from "./fixtures";

// Vite has no /api proxy, so an unmocked request would get index.html with a 200: the catch-all
// answers 404 instead, and the test fails on any request it did not mock. A `**/api/**` glob would
// also catch Vite's own `/src/client/api/` modules.
const isApi = (url: URL): boolean => url.pathname.startsWith("/api/");

const test = base.extend<{ unmockedApi: string[] }>({
  unmockedApi: [
    async ({ page }, use) => {
      const unmocked: string[] = [];
      await page.route(isApi, async (route) => {
        unmocked.push(`${route.request().method()} ${route.request().url()}`);
        return route.fulfill({ status: 404, json: {} });
      });
      await use(unmocked);
      expect(unmocked, "unmocked API requests").toEqual([]);
    },
    { auto: true },
  ],
});

const ui = (page: Page) => ({
  get signInText() {
    return page.getByText("Sign in to read your subscriptions.");
  },
  get signInLink() {
    return page.getByRole("link", { name: "Sign in", exact: true });
  },
  get entriesRegion() {
    return page.getByRole("region", { name: "Entries" });
  },
  get refreshButton() {
    return this.entriesRegion.getByRole("button", { name: "Refresh" });
  },
  get entriesAlert() {
    return this.entriesRegion.getByRole("alert");
  },
});

// An empty signed-in account, every /v3 read answering 429 when `limited()` returns true.
const mockSignedIn = async ({ page, limited }: { page: Page; limited: () => boolean }) => {
  const bodies: Record<string, unknown> = {
    "/api/v3/profile": { id: "user/e2e" },
    "/api/v3/collections": [],
    "/api/v3/subscriptions": [],
    "/api/v3/markers/counts": { unreadcounts: [], updated: 0 },
    "/api/v3/streams/contents": { id: "user/e2e/category/global.all", items: [] },
    "/api/v3/preferences": {},
  };
  await page.route("**/api/v3/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() !== "GET" || !(pathname in bodies)) return route.fallback();
    if (limited()) return route.fulfill({ status: 429, json: {} });
    return route.fulfill({ json: bodies[pathname] });
  });
  await page.route("**/api/auth/status", async (route) =>
    route.fulfill({ json: { signedIn: true } }),
  );
};

test.describe("app-level states", () => {
  test("shows the sign-in screen when signed out", async ({ page }) => {
    const pageUi = ui(page);
    await page.route("**/api/v3/**", async (route) => route.fulfill({ status: 401, json: {} }));
    await page.route("**/api/auth/status", async (route) =>
      route.fulfill({ json: { signedIn: false } }),
    );

    await page.goto("/");

    await expect(pageUi.signInText).toBeVisible();
    await expect(pageUi.signInLink).toHaveAttribute("href", "/api/auth/login");
  });

  test("a 429 keeps the reader signed in", async ({ page }) => {
    const pageUi = ui(page);
    let limited = false;
    await mockSignedIn({ page, limited: () => limited });

    await page.goto("/");

    await expect(pageUi.refreshButton).toBeVisible();

    limited = true;
    await pageUi.refreshButton.click();

    await expect(pageUi.entriesAlert).toContainText("429");
    await expect(pageUi.signInLink).toHaveCount(0);
  });
});
