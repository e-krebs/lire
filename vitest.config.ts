// Set before any worker starts, so every date the tests format reads the same on every host.
process.env.TZ = "UTC";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["text-summary", "json", "json-summary", "html"],
      reportOnFailure: true,
      exclude: [
        "src/**/__tests__/**",
        "src/test/**",
        "**/*.d.ts",
        "src/client/main.tsx",
        "src/client/router.tsx",
        "src/client/routeTree.gen.ts",
        "src/client/styles.css",
        "src/**/__stories__/**",
      ],
      thresholds: {
        perFile: true,
        statements: 80,
        lines: 80,
        functions: 80,
        "src/server/**": {
          statements: 100,
          lines: 100,
          functions: 100,
          branches: 100,
        },
      },
    },
    projects: [
      {
        plugins: [react()],
        resolve: { tsconfigPaths: true },
        test: {
          name: "client",
          include: ["src/{client,shared}/**/__tests__/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          // Files share one jsdom per worker, so src/test/setup.ts must undo whatever a test patches.
          pool: "threads",
          isolate: false,
          setupFiles: ["./src/test/setup.ts"],
          css: false,
          // Tests assert seed IDs and counts, so a complete fixtures/real/ recording must not win.
          // A fixed near-zero fixture delay, so no response lands in a later test.
          env: { VITE_FIXTURES: "seed", VITE_FIXTURE_LATENCY_MS: "0" },
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.toml" },
            // Secrets are absent from wrangler.toml; the tests need them set to cover the checks.
            miniflare: {
              bindings: {
                ACCESS_ALLOWED_EMAIL: "owner@example.com",
                NEWSBLUR_USERNAME: "owner",
                NEWSBLUR_PASSWORD: "test-password",
                NEWSBLUR_NEWSLETTER_ADDRESS: "demo-0000@newsletters.newsblur.com",
              },
            },
          }),
        ],
        resolve: { tsconfigPaths: true },
        test: {
          name: "server",
          include: ["src/server/**/__tests__/**/*.test.ts"],
        },
      },
      {
        // storybookTest does not load the Tailwind plugin, so the theme variables would be missing.
        plugins: [tailwindcss(), storybookTest({ configDir: ".storybook" })],
        resolve: { tsconfigPaths: true },
        test: {
          name: "storybook",
          // Parallel pages starve each other on a loaded machine and stories time out.
          maxWorkers: 2,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
