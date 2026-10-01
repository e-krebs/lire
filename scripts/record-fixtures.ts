import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  CollectionSchema,
  FeedSearchResponseSchema,
  MarkerCountsSchema,
  StreamContentsSchema,
  SubscriptionSchema,
} from "../src/shared/feedsApi/types.ts";
import type { Profile, RateLimit, StreamContents } from "../src/shared/feedsApi/types.ts";
import { globalAllStreamId } from "../src/shared/feedsApi/streams.ts";

// Records live feeds API v3 responses into fixtures/real/ — same layout as fixtures/seed/,
// but real (gitignored) data. Run manually against a personal dev token; never in CI.

const BASE_URL = "https://cloud.feedly.com";
const ENV_PATH = fileURLToPath(new URL("../.env.local", import.meta.url));
// Written into a scratch dir first, then swapped in for fixtures/real/ once every required file
// has succeeded — a run that fails partway through never leaves a half-recorded real/ behind.
const OUT_ROOT = fileURLToPath(new URL("../fixtures/real.tmp", import.meta.url));
const FINAL_ROOT = fileURLToPath(new URL("../fixtures/real", import.meta.url));

const fatal = (message: string): never => {
  console.error(message);
  process.exit(1);
};

// Fixture file name for a stream: no `%`, which breaks Vite's dev server module URLs.
const streamFileName = (streamId: string): string => streamId.replace(/[^A-Za-z0-9.-]+/g, "_");

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

const token = readEnvFile(ENV_PATH).FEEDLY_DEV_TOKEN;
if (!token) {
  fatal(
    `Missing FEEDLY_DEV_TOKEN in ${ENV_PATH} — add a developer token line (FEEDLY_DEV_TOKEN=...) and retry.`,
  );
}

// Clear out any scratch dir left by a previous failed run so it can't mix stale and fresh files.
rmSync(OUT_ROOT, { recursive: true, force: true });

// A holder, not a `let`: TS narrows a top-level `let` to `null` past closures that assign it.
const rateLimit: { last: RateLimit | null } = { last: null };

const captureRateLimit = (headers: Headers): void => {
  const count = headers.get("x-ratelimit-count");
  const limit = headers.get("x-ratelimit-limit");
  const reset = headers.get("x-ratelimit-reset");
  if (count && limit && reset) {
    rateLimit.last = { count: Number(count), limit: Number(limit), reset: Number(reset) };
  }
};

interface CallArgs {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | boolean>;
}

// The non-fatal primitive behind `call`: it reports the status instead of exiting, which is what
// an endpoint the account's plan may not grant (search/contents needs the paid plan) needs.
const fetchJson = async ({
  method = "GET",
  path,
  query,
}: CallArgs): Promise<{ status: number; statusText: string; body: unknown }> => {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { method, headers: { Authorization: `OAuth ${token}` } });
  captureRateLimit(res.headers);
  const body: unknown = res.ok ? await res.json() : null;
  await sleep(250);
  return { status: res.status, statusText: res.statusText, body };
};

const call = async (args: CallArgs): Promise<unknown> => {
  const { method = "GET", path } = args;
  const { status, statusText, body } = await fetchJson(args);

  if (status === 401) {
    fatal(
      `401 Unauthorized on ${method} ${path} — FEEDLY_DEV_TOKEN in ${ENV_PATH} is missing or revoked.`,
    );
  }
  if (status === 429) {
    fatal(
      `429 Too Many Requests on ${method} ${path} — rate limit ${rateLimit.last?.count}/${rateLimit.last?.limit}, resets ${rateLimit.last?.reset}.`,
    );
  }
  if (status >= 400) fatal(`${method} ${path} failed: ${status} ${statusText}`);

  return body;
};

const write = ({ relPath, data }: { relPath: string; data: unknown }): void => {
  const full = join(OUT_ROOT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`);
  console.log("wrote", full);
};

const profile = (await call({ path: "/v3/profile" })) as Profile;
write({ relPath: "profile.json", data: profile });

const collections = z.array(CollectionSchema).parse(await call({ path: "/v3/collections" }));
write({ relPath: "collections.json", data: collections });

const subscriptions = z.array(SubscriptionSchema).parse(await call({ path: "/v3/subscriptions" }));
write({ relPath: "subscriptions.json", data: subscriptions });

const markerCounts = MarkerCountsSchema.parse(await call({ path: "/v3/markers/counts" }));
write({ relPath: "markers-counts.json", data: markerCounts });

const globalAllId = globalAllStreamId(profile.id);

const recordedStreams = new Map<string, StreamContents>();

// One page is 100 entries. Only global.all gets a second page: two per collection pushed a full
// run past the 50-call daily budget (429 at 51/50 on 2026-09-21).
const recordStream = async ({
  id,
  label,
  pages,
}: {
  id: string;
  label: string;
  pages: 1 | 2;
}): Promise<void> => {
  const page1 = StreamContentsSchema.parse(
    await call({ path: "/v3/streams/contents", query: { streamId: id, count: 100 } }),
  );
  let merged: StreamContents = page1;
  if (pages === 2 && page1.continuation) {
    const page2 = StreamContentsSchema.parse(
      await call({
        path: "/v3/streams/contents",
        query: { streamId: id, count: 100, continuation: page1.continuation },
      }),
    );
    merged = {
      ...page1,
      items: [...page1.items, ...page2.items],
      continuation: page2.continuation,
    };
  } else if (pages === 2) {
    console.log(`no continuation for ${label} — only one page recorded`);
  }
  recordedStreams.set(id, merged);
  write({ relPath: `streams/${streamFileName(id)}.json`, data: merged });
};

await recordStream({ id: globalAllId, label: "global.all", pages: 2 });

// The probes run before the per-collection streams, so a budget hit late in the run can't take
// them down with it.
const firstFeedCollection = collections.find((collection) => collection.feeds.length > 0);
const searchFeed = firstFeedCollection?.feeds[0];
if (searchFeed) {
  const searchQuery = searchFeed.website ?? searchFeed.id.replace(/^feed\//, "");
  const searchResults = FeedSearchResponseSchema.parse(
    await call({ path: "/v3/search/feeds", query: { query: searchQuery, count: 5 } }),
  );
  write({ relPath: "search-feeds.json", data: searchResults });
} else {
  console.log("no feed found in any collection — skipping search/feeds");
}

// A term the account provably has articles for: the first long-enough word of the newest entry.
const MIN_SEARCH_WORD_LENGTH = 4;
const searchTerm = recordedStreams
  .get(globalAllId)
  ?.items.at(0)
  ?.title?.split(/\s+/)
  .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
  .find((word) => word.length >= MIN_SEARCH_WORD_LENGTH);

if (searchTerm) {
  const { status, body } = await fetchJson({
    path: "/v3/search/contents",
    query: { streamId: globalAllId, query: searchTerm, count: 20 },
  });
  if (status === 200) {
    write({ relPath: "search-contents.json", data: StreamContentsSchema.parse(body) });
  } else {
    // Search is a paid-plan feature — a free plan answers 401/402/403 here.
    console.log(`search/contents not available: ${status}`);
  }
} else {
  console.log("no usable search term in the recorded entries — skipping search/contents");
}

// The official web app keeps per-stream settings (view mode, open-in-new-tab) in this undocumented
// key-value store; recorded to see whether the shape is worth relying on.
{
  const { status, body } = await fetchJson({ path: "/v3/preferences" });
  if (status === 200 && body !== null && typeof body === "object") {
    write({ relPath: "preferences.json", data: body });
    console.log(`preferences: ${Object.keys(body).length} keys`);
  } else {
    console.log(`preferences not available: ${status}`);
  }
}

// An empty collection has no stream worth a call.
for (const collection of collections.filter((candidate) => candidate.feeds.length > 0)) {
  await recordStream({ id: collection.id, label: collection.label, pages: 1 });
}

console.log(
  `rate limit after last call: ${rateLimit.last?.count ?? "?"}/${rateLimit.last?.limit ?? "?"}`,
);

// Every required file wrote successfully (an earlier failure would have exited via `fatal`) —
// swap the scratch dir in for fixtures/real/.
rmSync(FINAL_ROOT, { recursive: true, force: true });
renameSync(OUT_ROOT, FINAL_ROOT);
console.log(`replaced ${FINAL_ROOT} with the freshly recorded fixtures`);
