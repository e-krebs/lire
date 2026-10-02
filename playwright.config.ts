import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

const SEED_URL = "http://localhost:3000";

const ownServerSpecs = [/states\.spec\.ts/, /demo\.spec\.ts/, /pwa\.spec\.ts/, /login\.spec\.ts/];

const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

// `yarn dev` pins port 3000 and Vite would drift to the next free port, so each extra server
// names its own and fails fast when it is taken.
const devServer = ({ port, env }: { port: number; env: Record<string, string> }) => ({
  command: `yarn vite dev --host --port ${port} --strictPort`,
  // The webServer env beats .env.local, which Vite reads only for unset variables.
  env: { ...process.env, ...env } as Record<string, string>,
  url: `http://localhost:${port}`,
  reuseExistingServer: !CI,
  timeout: 120_000,
});

const statesServer = devServer({ port: 3001, env: { VITE_API_MODE: "real" } });
const demoServer = devServer({
  port: 3002,
  env: { VITE_DEMO: "true", VITE_API_MODE: "mock", VITE_FIXTURES: "seed" },
});
// Only a build carries the precached production service worker. It gets its own outDir, so a
// `yarn deploy:spa` after an e2e run cannot ship this mock build.
const pwaServer = {
  command:
    "yarn vite build --outDir dist-e2e && yarn vite preview --outDir dist-e2e --port 3003 --strictPort",
  env: { ...process.env, VITE_API_MODE: "mock", VITE_FIXTURES: "seed" } as Record<string, string>,
  url: "http://localhost:3003",
  reuseExistingServer: !CI,
  timeout: 180_000,
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // Ends the run with a report before the e2e job timeout cancels it and skips the upload.
  globalTimeout: CI ? 10 * 60_000 : undefined,
  // The 2-vCPU private-repo runner resolves the 50% default to one worker.
  workers: CI ? 2 : undefined,
  // Mock mode loads the fixture transport as its own chunk, one more round trip before the first
  // data, and a dev server shared by parallel workers can push that past the 5s default.
  expect: { timeout: 10_000 },
  reporter: CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: SEED_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "pixel-9-pro",
      testIgnore: ownServerSpecs,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 412, height: 923 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "ipad-air-4",
      testIgnore: ownServerSpecs,
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      testIgnore: ownServerSpecs,
      use: desktop,
    },
    {
      name: "states",
      testMatch: /states\.spec\.ts/,
      // The dev service worker would answer /api itself, out of page.route's reach.
      use: { ...desktop, baseURL: statesServer.url, serviceWorkers: "block" },
    },
    {
      name: "demo",
      testMatch: /demo\.spec\.ts/,
      use: { ...desktop, baseURL: demoServer.url },
    },
    {
      name: "pwa",
      testMatch: /pwa\.spec\.ts/,
      use: { ...desktop, baseURL: pwaServer.url },
    },
    {
      // Each test starts its own worker in Miniflare, see e2e/support/worker.ts.
      name: "login",
      testMatch: /login\.spec\.ts/,
      use: desktop,
    },
  ],
  webServer: [
    {
      command: "yarn dev",
      // The synthetic data, whatever a recording left in fixtures/real/.
      env: { ...process.env, VITE_FIXTURES: "seed" },
      url: SEED_URL,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    statesServer,
    demoServer,
    pwaServer,
  ],
});
