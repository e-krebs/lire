import { chromium, type Browser, type FullConfig } from "@playwright/test";
import { CoverageReport } from "monocart-coverage-reports";
import { COVERAGE, coverageOptions } from "./fixtures";

const warmSeed = async ({ browser, baseURL }: { browser: Browser; baseURL: string }) => {
  const page = await browser.newPage({ baseURL });
  page.setDefaultTimeout(60_000);
  await page.goto("/stream/all/entry/news-0029");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.goto("/subscriptions");
  await page.getByRole("tab", { name: /^Categories · / }).waitFor();
};

// Real API mode has no backend in e2e: a signed-out answer loads the root and its sign-in screen,
// and the stream route compiles on the way.
const warmRealMode = async ({ browser, baseURL }: { browser: Browser; baseURL: string }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: "block" });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => route.fulfill({ status: 401, json: {} }),
  );
  await page.route("**/api/auth/status", async (route) =>
    route.fulfill({ json: { signedIn: false } }),
  );
  await page.goto("/stream/all");
  await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
};

// A cold dev server compiles each split route on its first request, which under parallel workers
// outlasts the 5s expect timeout, so every route is loaded once per server before any worker starts.
export default async function globalSetup(config: FullConfig): Promise<void> {
  // Stale cache from an earlier run would merge into this report.
  if (COVERAGE) new CoverageReport(coverageOptions).cleanCache();
  const servers = new Map<string, typeof warmSeed>();
  for (const project of config.projects) {
    // It runs no web server: each test starts its own worker.
    if (project.name === "login") continue;
    const { baseURL } = project.use;
    if (!baseURL) throw new Error(`globalSetup needs use.baseURL on project ${project.name}`);
    servers.set(baseURL, project.name === "states" ? warmRealMode : warmSeed);
  }
  const browser = await chromium.launch();
  try {
    await Promise.all([...servers].map(async ([baseURL, warm]) => warm({ browser, baseURL })));
  } finally {
    await browser.close();
  }
}
