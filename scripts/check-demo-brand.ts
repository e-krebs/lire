import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2] ?? "dist";
const REAL_PROFILE = "fixtures/real/profile.json";
const EXCERPT = 40;

// The recorded profile is gitignored, so this only bites on a machine that holds it.
const profileNeedles = existsSync(REAL_PROFILE)
  ? (() => {
      const { id, email } = JSON.parse(readFileSync(REAL_PROFILE, "utf8")) as {
        id?: string;
        email?: string;
      };
      return [id, email].filter((v): v is string => Boolean(v));
    })()
  : [];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const excerpt = ({ text, index, length }: { text: string; index: number; length: number }) =>
  text.slice(Math.max(0, index - EXCERPT), index + length + EXCERPT).replace(/\s+/g, " ");

const hits = walk(DIR).flatMap((file) => {
  const text = readFileSync(file, "utf8");
  const brand = [...text.matchAll(/feedly/gi)].map(
    (m) => `${file}: …${excerpt({ text, index: m.index, length: m[0].length })}…`,
  );
  const profile = profileNeedles
    .filter((needle) => text.includes(needle))
    .map((needle) => `${file}: recorded profile value (${needle.length} chars)`);
  return [...brand, ...profile];
});

if (hits.length) {
  console.error(`Demo brand gate: ${hits.length} match(es) in ${DIR}/:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`demo brand gate: ${DIR}/ clean`);
