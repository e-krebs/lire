import { test as base } from "@playwright/test";
import { CoverageReport, type CoverageReportOptions } from "monocart-coverage-reports";

export * from "@playwright/test";

export const COVERAGE = process.env.E2E_COVERAGE === "1";

export const coverageOptions: CoverageReportOptions = {
  name: "Lire e2e coverage",
  outputDir: "coverage/e2e",
  reports: ["json-summary", "json", "html"],
  entryFilter: (entry) => {
    const { pathname } = new URL(entry.url);
    return pathname.startsWith("/src/") && !pathname.endsWith(".css");
  },
  // Vite's inline source maps name only the file, so the path comes from the served URL.
  sourcePath: (filePath, { distFile }) =>
    typeof distFile === "string" ? distFile.replace(/^[^/]+\/|[^/]+$/g, "") + filePath : filePath,
  sourceFilter: (sourcePath) => sourcePath.startsWith("src/"),
};

export const test = base.extend<{ jsCoverage: void }>({
  jsCoverage: [
    async ({ page }, use, testInfo) => {
      const collect = COVERAGE && testInfo.project.name === "desktop";
      if (collect) await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      if (collect)
        await new CoverageReport(coverageOptions).add(await page.coverage.stopJSCoverage());
    },
    { auto: true },
  ],
});
