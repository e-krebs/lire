import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2] ?? "dist";
const REAL_PROFILE = "fixtures/real/profile.json";

// The recorded profile is gitignored, so this only bites on a machine that holds it.
const profileNeedles = existsSync(REAL_PROFILE)
  ? (() => {
      const { user_profile } = JSON.parse(readFileSync(REAL_PROFILE, "utf8")) as {
        user_profile?: { username?: string; email?: string };
      };
      return [user_profile?.username, user_profile?.email].filter((v): v is string => Boolean(v));
    })()
  : [];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const hits = walk(DIR).flatMap((file) => {
  const text = readFileSync(file, "utf8");
  const profile = profileNeedles
    .filter((needle) => text.includes(needle))
    .map((needle) => `${file}: recorded profile value (${needle.length} chars)`);
  return profile;
});

if (hits.length) {
  console.error(`Demo gate: ${hits.length} match(es) in ${DIR}/:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`demo gate: ${DIR}/ clean`);
