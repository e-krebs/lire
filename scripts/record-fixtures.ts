import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FeedAutocompleteAnswerSchema,
  FeedsAnswerSchema,
  PreferencesAnswerSchema,
  RefreshFeedsAnswerSchema,
  StoriesAnswerSchema,
  UserProfileAnswerSchema,
} from "../src/shared/bff/upstream.ts";

// Records live NewsBlur answers into fixtures/real/ — same layout as fixtures/seed/, but real
// (gitignored) data. Run manually with NEWSBLUR_USERNAME and NEWSBLUR_PASSWORD; never in CI.

const BASE_URL = "https://newsblur.com";
// NewsBlur refuses an empty User-Agent.
const USER_AGENT = "lire-fixture-recorder";
const MAX_STORY_PAGES = 3;
const ENV_PATH = fileURLToPath(new URL("../.env.local", import.meta.url));
// Written into a scratch dir first, then swapped in for fixtures/real/ once every required file
// has succeeded — a run that fails partway through never leaves a half-recorded real/ behind.
const OUT_ROOT = fileURLToPath(new URL("../fixtures/real.tmp", import.meta.url));
const FINAL_ROOT = fileURLToPath(new URL("../fixtures/real", import.meta.url));

const fatal = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const readEnvFile = (path: string): Record<string, string> => {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
};

const env = readEnvFile(ENV_PATH);
const { NEWSBLUR_USERNAME: username, NEWSBLUR_PASSWORD: password } = env;
if (!username || !password) {
  fatal(
    `Missing NEWSBLUR_USERNAME or NEWSBLUR_PASSWORD in ${ENV_PATH} — add both lines and retry.`,
  );
}

// Clear out any scratch dir left by a previous failed run so it can't mix stale and fresh files.
rmSync(OUT_ROOT, { recursive: true, force: true });

const sessionCookie = await (async (): Promise<string> => {
  const res = await fetch(new URL("/api/login", BASE_URL), {
    method: "POST",
    headers: { "User-Agent": USER_AGENT },
    body: new URLSearchParams({ username: username ?? "", password: password ?? "" }),
  });
  const answer = (await res.json().catch(() => null)) as { code?: number } | null;
  // Bad credentials answer 200 with `code: -1`.
  if (!res.ok || answer?.code !== 1) {
    return fatal(`NewsBlur login failed (${res.status}, code ${answer?.code ?? "?"}).`);
  }
  const cookie = res.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .find((entry) => entry.startsWith("newsblur_sessionid="));
  return cookie ?? fatal("NewsBlur login gave no newsblur_sessionid cookie.");
})();

interface CallArgs {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | boolean>;
}

const call = async ({ method = "GET", path, query }: CallArgs): Promise<unknown> => {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
  const res = await fetch(url, {
    method,
    headers: { Cookie: sessionCookie, "User-Agent": USER_AGENT },
  });
  await sleep(250);
  if (res.status === 429) fatal(`429 Too Many Requests on ${method} ${path}.`);
  if (!res.ok) fatal(`${method} ${path} failed: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { code?: number; authenticated?: boolean } | null;
  if (body?.authenticated === false) fatal(`${method} ${path}: the session is not authenticated.`);
  if (typeof body?.code === "number" && body.code < 1)
    fatal(`${method} ${path}: code ${body.code}.`);
  return body;
};

const write = ({ relPath, data }: { relPath: string; data: unknown }): void => {
  const full = join(OUT_ROOT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`);
  console.log("wrote", full);
};

const profile = UserProfileAnswerSchema.parse(await call({ path: "/social/load_user_profile" }));
write({ relPath: "profile.json", data: profile });

const feedsAnswer = FeedsAnswerSchema.parse(await call({ path: "/reader/feeds" }));
write({ relPath: "feeds.json", data: feedsAnswer });

const refreshAnswer = RefreshFeedsAnswerSchema.parse(await call({ path: "/reader/refresh_feeds" }));
write({ relPath: "refresh_feeds.json", data: refreshAnswer });

// Raw story objects, as NewsBlur sent them; the schema only checks the shape.
const recordStories = async ({ path, relPath }: { path: string; relPath: string }) => {
  const stories: unknown[] = [];
  for (let page = 1; page <= MAX_STORY_PAGES; page++) {
    const raw = await call({ path, query: { page, read_filter: "all", include_hidden: true } });
    const answer = StoriesAnswerSchema.parse(raw);
    if (answer.stories.length === 0) break;
    stories.push(...(raw as { stories: unknown[] }).stories);
  }
  write({ relPath, data: stories });
};

for (const feedId of Object.keys(feedsAnswer.feeds)) {
  await recordStories({ path: `/reader/feed/${feedId}`, relPath: `stories/${feedId}.json` });
}

await recordStories({ path: "/reader/read_stories", relPath: "read_stories.json" });

const firstFeed = Object.values(feedsAnswer.feeds).at(0);
const term = firstFeed?.feed_title.split(/\s+/).find((word) => word.length >= 3);
if (term) {
  const autocomplete = FeedAutocompleteAnswerSchema.parse(
    await call({ path: "/rss_feeds/feed_autocomplete", query: { term, v: 2 } }),
  );
  write({ relPath: "feed_autocomplete.json", data: autocomplete });
} else {
  console.log("no feed title to search with — skipping feed_autocomplete");
}

const preferences = PreferencesAnswerSchema.parse(await call({ path: "/profile/get_preference" }));
write({ relPath: "preferences.json", data: preferences });

// Every required file wrote successfully (an earlier failure would have exited via `fatal`) —
// swap the scratch dir in for fixtures/real/.
rmSync(FINAL_ROOT, { recursive: true, force: true });
renameSync(OUT_ROOT, FINAL_ROOT);
console.log(`replaced ${FINAL_ROOT} with the freshly recorded fixtures`);
