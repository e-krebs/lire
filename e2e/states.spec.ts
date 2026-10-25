import { ANDROID_USER_AGENT, expect, PLAY_STORE_URL, test as base, type Page } from "./fixtures";
import { mockStandalone } from "./support/standalone";

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
    return page.getByText("Sign in with NewsBlur to read your subscriptions.");
  },
  get signInLinks() {
    return page.getByRole("link", { name: "Sign in with NewsBlur", exact: true });
  },
  get signInLink() {
    return page.getByRole("link", { name: "Sign in with NewsBlur", exact: true }).first();
  },
  get entriesRegion() {
    return page.getByRole("region", { name: "Entries" });
  },
  get splash() {
    return page.getByRole("status", { name: "Checking your session…" });
  },
  get refreshButton() {
    return this.entriesRegion.getByRole("button", { name: "Refresh" });
  },
  get entriesAlert() {
    return this.entriesRegion.getByRole("alert");
  },
  get accountButton() {
    return page.getByRole("button", { name: "Account and app info" });
  },
  get creditsLink() {
    return page.getByRole("link", { name: "Credits", exact: true });
  },
  get creditsHeading() {
    return page.getByRole("heading", { level: 1, name: "Credits" });
  },
  get backToSignInLink() {
    return page.getByRole("link", { name: "Back to sign in" });
  },
  get playBadge() {
    return page.getByRole("link", { name: "Get it on Google Play", exact: true });
  },
  get androidAppLink() {
    return page.getByRole("link", { name: "Get the Android app", exact: true });
  },
  get swipeStage() {
    return page.locator(".landing-stage--swipe");
  },
  get steps() {
    return page.getByRole("list", { name: "How it works, in three steps" });
  },
  get deviceFiguresHeading() {
    return page.getByRole("heading", { name: "Works across devices" });
  },
  get fluidDemosHeading() {
    return page.getByRole("heading", { name: "Fluid, responsive and smooth" });
  },
  get installButton() {
    return page.getByRole("button", {
      name: "Install Lire from your browser and it opens like any other app.",
    });
  },
  get main() {
    return page.locator("main");
  },
  get banner() {
    return page.getByRole("banner");
  },
  get viewportMeta() {
    return page.locator('meta[name="viewport"]');
  },
  get welcomeTitle() {
    return page.getByText("Welcome to Lire.");
  },
  get addFeedLink() {
    return page.getByRole("link", { name: "Add a first feed" });
  },
  get newsletterLink() {
    return page.getByRole("link", { name: "Get your newsletter address" });
  },
  get alert() {
    return page.getByRole("alert");
  },
  get tryAgainLink() {
    return page.getByRole("link", { name: "Try again" });
  },
});

const mockSignedOut = async (page: Page) => {
  await page.route(isApi, async (route) => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/auth/status", async (route) =>
    route.fulfill({ json: { signedIn: false } }),
  );
};

// An empty signed-in account, every read answering 429 when `limited()` returns true.
const mockSignedIn = async ({ page, limited }: { page: Page; limited: () => boolean }) => {
  const bodies: Record<string, unknown> = {
    "/api/profile": { username: "e2e" },
    "/api/categories": [],
    "/api/feeds": [],
    "/api/counts": { all: 0, feeds: {}, categories: {} },
    "/api/streams/all/entries": { items: [] },
    "/api/preferences": {},
    "/api/sun": { phase: "day", nextChangeAt: new Date(Date.now() + 3_600_000).toISOString() },
  };
  await page.route(isApi, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() === "POST" && pathname === "/api/feeds/refresh") {
      return route.fulfill({ status: 204 });
    }
    if (route.request().method() !== "GET" || !(pathname in bodies)) return route.fallback();
    // A tiny retryAfter keeps the client's two rate-limit retries from waiting the 60 s fallback.
    if (limited()) return route.fulfill({ status: 429, json: { retryAfter: 0.01 } });
    return route.fulfill({ json: bodies[pathname] });
  });
  await page.route("**/api/auth/status", async (route) =>
    route.fulfill({ json: { signedIn: true } }),
  );
};

// The install button renders only once the browser offers a prompt, so the offer is fired by hand.
const offerInstall = async (page: Page) =>
  page.evaluate(() => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });

test.describe("app-level states", () => {
  test("renders the signed-out landing at every tier without horizontal overflow", async ({
    page,
  }) => {
    const pageUi = ui(page);
    const viewports = [
      { width: 412, height: 923 },
      { width: 820, height: 1180 },
      { width: 1440, height: 900 },
    ];
    await mockSignedOut(page);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto("/");

      await expect(pageUi.signInLink).toBeVisible();
      await expect(pageUi.steps).toBeVisible();
      await expect(pageUi.deviceFiguresHeading).toBeVisible();
      await expect(pageUi.fluidDemosHeading).toBeVisible();
      await expect(pageUi.swipeStage).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  });

  test("shows the empty-account pointers when signed in without feeds", async ({ page }) => {
    const pageUi = ui(page);
    await mockSignedIn({ page, limited: () => false });
    await page.goto("/");

    await expect(pageUi.welcomeTitle).toBeVisible();
    await expect(pageUi.addFeedLink).toHaveAttribute("href", "/subscriptions?add=true");
    await expect(pageUi.newsletterLink).toHaveAttribute("href", "/subscriptions?newsletter=true");
    await expect(pageUi.entriesRegion).toBeVisible();
  });

  test("shows only the splash while auth status is pending", async ({ page }) => {
    const pageUi = ui(page);
    let releaseStatus: (() => void) | undefined;
    await page.route("**/api/auth/status", async (route) => {
      await new Promise<void>((resolve) => {
        releaseStatus = resolve;
      });
      await route.fulfill({ json: { signedIn: false } });
    });
    await page.goto("/");

    await expect(pageUi.splash).toBeVisible();
    await expect(pageUi.signInText).toHaveCount(0);
    await expect(pageUi.steps).toHaveCount(0);
    await expect(pageUi.entriesRegion).toHaveCount(0);

    releaseStatus?.();
    await expect(pageUi.signInLink).toBeVisible();
  });

  test("hides install prompts in standalone mode", async ({ page }) => {
    const pageUi = ui(page);
    await mockStandalone(page);
    await mockSignedOut(page);
    await page.goto("/");

    await expect(pageUi.signInLink).toBeVisible();
    await offerInstall(page);
    await expect(pageUi.installButton).toHaveCount(0);
    await expect(pageUi.playBadge).toHaveCount(0);
  });

  test.describe("when sign-in fails", () => {
    const viewports = [
      { width: 412, height: 923 },
      { width: 820, height: 1180 },
      { width: 1024, height: 768 },
    ];
    const failures = [
      { cause: "failed", message: "NewsBlur sign-in failed, try again." },
      {
        cause: "denied",
        message: "You declined access on NewsBlur, so Lire can't read your subscriptions yet.",
      },
      { cause: "expired", message: "This sign-in took too long and expired. Start it again." },
    ] as const;

    for (const { cause, message } of failures) {
      test(`shows the ${cause} message at every tier`, async ({ page }) => {
        const pageUi = ui(page);
        await mockSignedOut(page);

        for (const viewport of viewports) {
          await page.setViewportSize(viewport);
          await page.goto(`/?signin=${cause}`);

          await expect(pageUi.alert).toHaveText(message);
          await expect(pageUi.tryAgainLink).toHaveAttribute("href", "/api/auth/login");
        }
      });
    }
  });

  test("shows the sign-in screen when signed out", async ({ page }) => {
    const pageUi = ui(page);
    await mockSignedOut(page);

    await page.goto("/");

    await expect(pageUi.signInText).toBeVisible();
    await expect(pageUi.signInLinks).toHaveCount(2);
    await expect(pageUi.signInLink).toHaveAttribute("href", "/api/auth/login");
  });

  test("the signed-out landing has no top bar, and Credits returns to it", async ({ page }) => {
    const pageUi = ui(page);
    await mockSignedOut(page);
    await page.goto("/");

    await expect(pageUi.signInLink).toBeVisible();
    await expect(pageUi.accountButton).toHaveCount(0);

    await pageUi.creditsLink.click();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(pageUi.creditsHeading).toBeVisible();
    await pageUi.backToSignInLink.click();
    await expect(pageUi.signInLink).toBeVisible();
  });

  test("the landing has no Play badge on desktop", async ({ page }) => {
    const pageUi = ui(page);
    await mockSignedOut(page);
    await page.goto("/");

    await expect(pageUi.signInLink).toBeVisible();
    await expect(pageUi.playBadge).toHaveCount(0);
  });

  test.describe("when on Android", () => {
    test.use({ userAgent: ANDROID_USER_AGENT });

    test("shows the Play badge and the Android app link, but not under ?source=twa", async ({
      page,
    }) => {
      const pageUi = ui(page);
      await mockSignedOut(page);
      await page.goto("/");

      await expect(pageUi.playBadge).toHaveAttribute("href", PLAY_STORE_URL);
      await expect(pageUi.playBadge).toHaveAttribute("target", "_blank");
      await expect(pageUi.playBadge).toHaveAttribute("rel", "noopener noreferrer");

      await page.goto("/credits");
      await expect(pageUi.androidAppLink).toHaveAttribute("href", PLAY_STORE_URL);
      await expect(pageUi.androidAppLink).toHaveAttribute("target", "_blank");
      await expect(pageUi.androidAppLink).toHaveAttribute("rel", "noopener noreferrer");

      await page.goto("/credits?source=twa");
      await expect(pageUi.creditsHeading).toBeVisible();
      await expect(pageUi.androidAppLink).toHaveCount(0);

      await page.goto("/?source=twa");
      await expect(pageUi.signInLink).toBeVisible();
      await expect(pageUi.playBadge).toHaveCount(0);
      await offerInstall(page);
      await expect(pageUi.installButton).toHaveCount(0);
      await expect(pageUi.banner).toHaveCount(0);
      await expect(pageUi.main).toHaveClass(/pt-safe.*pr-safe.*pb-safe.*pl-safe/);
      await expect(pageUi.viewportMeta).toHaveAttribute("content", /viewport-fit=cover/);
    });
  });

  test.describe("when reduced motion is requested", () => {
    test.use({ reducedMotion: "reduce" });

    test("the landing demos do not animate", async ({ page }) => {
      await mockSignedOut(page);
      await page.goto("/");

      await expect(ui(page).signInLink).toBeVisible();
      await expect(ui(page).swipeStage).toHaveCSS("animation-name", "none");
    });
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
