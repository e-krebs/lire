import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
// Named-secret patterns, not a bare /secret/ match — react-dom's own bundle ships strings like
// "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED", which a generic word match would flag.
const FORBIDDEN = [
  /\bNEWSBLUR_PASSWORD\b/,
  // A newsletter address carries NewsBlur's secret token; only the demo address may ship.
  /(?<!\bdemo-0000)@newsletters\.newsblur\.com\b/,
  /sk_test_[A-Za-z0-9]+/,
  /sk_live_[A-Za-z0-9]+/,
];
const TRACKED_ENV_FILES = [".env.sample"];

// .gitignore is the only thing keeping a real env file out of the index, and a pruned or mistyped
// pattern there fails silently. Matched on filename alone, and the globs lead with `*` because a
// pathspec is root-anchored while .gitignore matches at any depth.
const trackedEnv = execSync("git ls-files -z -- '*.env*' '*.dev.vars*'", { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => !TRACKED_ENV_FILES.includes(file));
if (trackedEnv.length) {
  console.error(`Env file(s) committed that carry secrets: ${trackedEnv.join(", ")}`);
  process.exit(1);
}

const leakyEnv = Object.keys(process.env).filter(
  (k) => k.startsWith("VITE_") && /SECRET|CLIENT_SECRET|TOKEN/i.test(k),
);
if (leakyEnv.length) {
  console.error(`Secret-shaped VITE_ vars would be bundled: ${leakyEnv.join(", ")}`);
  process.exit(1);
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const files = walk(DIST);

const hits = files.flatMap((file) => {
  const text = readFileSync(file, "utf8");
  return FORBIDDEN.filter((re) => re.test(text)).map((re) => `${re} in ${file}`);
});

if (hits.length) {
  console.error(`Secret leak in dist/:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("secret gate: index + dist/ clean");

// A mock build ships the seed fixtures on purpose, so only a real build is held to this.
if (process.env.VITE_API_MODE === "real") {
  const FIXTURE_MARKERS = ["fixtures/seed/", "lire.fixture."];
  const fixtureHits = files
    .filter((file) => file.endsWith(".js"))
    .flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return FIXTURE_MARKERS.filter((m) => text.includes(m)).map((m) => `${m} in ${file}`);
    });
  if (fixtureHits.length) {
    console.error(`Seed fixtures in a real build's dist/:\n${fixtureHits.join("\n")}`);
    process.exit(1);
  }
  console.log("fixture gate: real dist/ carries no seed fixtures");
}
