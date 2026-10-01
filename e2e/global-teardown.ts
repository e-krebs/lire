import { CoverageReport } from "monocart-coverage-reports";
import { COVERAGE, coverageOptions } from "./fixtures";

export default async function globalTeardown(): Promise<void> {
  if (COVERAGE) await new CoverageReport(coverageOptions).generate();
}
