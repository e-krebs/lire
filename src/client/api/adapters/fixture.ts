import { z } from "zod";
import { handle, type BffResponse, type FeedsCache } from "shared/bff/handle";
import type { FeedsAnswer } from "shared/bff/upstream";
import { matchRoute } from "shared/feedsApi/routes";
import { PreferencesSchema, type Preferences } from "shared/feedsApi/types";
import {
  createFakeNewsblur,
  FAKE_USER_ID,
  type FakeNewsblurFixtures,
} from "client/api/adapters/fakeNewsblur";
import type { Transport, TransportRequest, TransportResponse } from "client/api/transport";

// Mock mode runs the Worker's own BFF core over a fake NewsBlur fed by fixtures, so the client
// sees the same answers as from the Worker.

// ---- Fixture loading --------------------------------------------------------------------------

type FixtureDir = "real" | "seed";

// `real/` stays out of production builds: Vite drops the dead branch, so the recording is never bundled.
const modules = {
  ...import.meta.glob<{ default: unknown }>("/fixtures/seed/**/*.json", { eager: true }),
  ...(import.meta.env.DEV
    ? import.meta.glob<{ default: unknown }>("/fixtures/real/**/*.json", { eager: true })
    : {}),
};

const filesIn = (dir: FixtureDir): Map<string, unknown> => {
  const marker = `/fixtures/${dir}/`;
  const files = new Map<string, unknown>();
  for (const [path, mod] of Object.entries(modules)) {
    const index = path.indexOf(marker);
    if (index !== -1) files.set(path.slice(index + marker.length), mod.default);
  }
  return files;
};

const STORY_FILE = /^stories\/(\d+)\.json$/;

// `real/` is gitignored, written by scripts/record-fixtures.ts from a live account. Only trust it
// once it holds every file the app needs; a half-recorded run falls back to `seed/`.
const REQUIRED_REAL_FILES = ["feeds.json", "refresh_feeds.json", "profile.json"];

const isComplete = (files: Map<string, unknown>): boolean =>
  REQUIRED_REAL_FILES.every((file) => files.has(file)) &&
  [...files.keys()].some((path) => STORY_FILE.test(path));

const seedFiles = filesIn("seed");
const realFiles = filesIn("real");

if (realFiles.size > 0 && !isComplete(realFiles)) {
  console.warn("fixtures/real/ is missing required files — falling back to fixtures/seed/.");
}

const FeedAutocompleteSchema = z.object({
  feeds: z.array(
    z.object({ value: z.string(), label: z.string(), num_subscribers: z.number().optional() }),
  ),
});
const PreferencesAnswerSchema = z.object({ payload: z.record(z.string(), z.unknown()) });

// The optional files fall back to the seed's copy, or to an empty answer.
const toFixtures = (files: Map<string, unknown>): FakeNewsblurFixtures => {
  const file = (name: string) => files.get(name) ?? seedFiles.get(name);
  const stories: Record<string, unknown[]> = {};
  for (const [path, content] of files) {
    const feedId = STORY_FILE.exec(path)?.[1];
    if (feedId && Array.isArray(content)) stories[feedId] = content;
  }
  return {
    feeds: file("feeds.json"),
    refreshFeeds: file("refresh_feeds.json"),
    stories,
    readStories: z.array(z.unknown()).parse(files.get("read_stories.json") ?? []),
    feedAutocomplete: FeedAutocompleteSchema.parse(file("feed_autocomplete.json")),
    preferences: PreferencesAnswerSchema.parse(files.get("preferences.json") ?? { payload: {} }),
    profile: file("profile.json"),
    webfeedAnalyze: file("webfeed_analyze.json"),
  };
};

export const seedFixtures: FakeNewsblurFixtures = toFixtures(seedFiles);

// `VITE_FIXTURES=seed` keeps the synthetic data even when a recording exists: e2e runs on it, and
// a live account with nothing unread is no place to work on the unread-only grid.
const fixtures: FakeNewsblurFixtures =
  isComplete(realFiles) && import.meta.env.VITE_FIXTURES !== "seed"
    ? toFixtures(realFiles)
    : seedFixtures;

// ---- Backend ------------------------------------------------------------------------------------

export const DEMO_NEWSLETTER_ADDRESS = "demo-0000@newsletters.newsblur.com";

const toSearchParams = (query: TransportRequest["query"]): URLSearchParams => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params;
};

// The `/reader/feeds` cache the Durable Object keeps in the Worker, kept in memory here.
const createMemoryCache = (): FeedsCache => {
  let cached: FeedsAnswer | undefined;
  let generation = 0;
  return {
    get: async () => Promise.resolve({ value: cached, generation }),
    set: async (input) => {
      if (input.generation === generation) cached = input.value;
      return Promise.resolve();
    },
    clear: async () => {
      cached = undefined;
      generation += 1;
      return Promise.resolve();
    },
  };
};

// The BFF core over a fresh fake NewsBlur. Its state lives as long as the backend does.
export const createFixtureBackend = ({ fixtures }: { fixtures: FakeNewsblurFixtures }) => {
  const upstream = createFakeNewsblur({ fixtures });
  const cache = createMemoryCache();
  return async ({ method, path, query, body }: TransportRequest): Promise<BffResponse> => {
    const match = matchRoute({ method, pathname: path });
    if (!match) return { status: 404, body: { error: "not_found" } };
    try {
      return await handle({
        route: match.route,
        params: match.params,
        query: toSearchParams(query),
        body,
        upstream,
        config: { newsletterAddress: DEMO_NEWSLETTER_ADDRESS, userId: FAKE_USER_ID },
        cache,
      });
    } catch {
      return { status: 500, body: { error: "internal_error" } };
    }
  };
};

// The preferences are the one fixture mutation that outlives a reload: they stand in for the
// account, and the flags they hold ("Opens on its site") were set by hand.
const PREFERENCES_STORAGE_KEY = "lire.fixture.preferences.v2";

const storedPreferences = (): Preferences | undefined => {
  try {
    const stored = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (stored !== null) return PreferencesSchema.parse(JSON.parse(stored));
  } catch {
    // Blocked storage or a hand-edited value: fall through to the fixture.
  }
  return undefined;
};

// NewsBlur stores each Lire value JSON-encoded, beside its own keys.
const withStoredPreferences = (base: FakeNewsblurFixtures): FakeNewsblurFixtures => {
  const stored = storedPreferences();
  if (!stored) return base;
  const payload = Object.fromEntries(
    Object.entries(base.preferences.payload).filter(([key]) => !key.startsWith("lire.")),
  );
  for (const [key, value] of Object.entries(stored)) payload[key] = JSON.stringify(value);
  return { ...base, preferences: { payload } };
};

const savePreferences = (preferences: unknown): void => {
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // A private window or a full quota: the preferences still hold for this session.
  }
};

let backend = createFixtureBackend({ fixtures: withStoredPreferences(fixtures) });

// Starts over from the loaded fixtures — for tests, so each one starts from the same baseline
// instead of depending on mutations left over by whichever test ran before it.
export const resetFixtureState = (): void => {
  try {
    window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
  } catch {
    // Nothing stored, nothing to forget.
  }
  backend = createFixtureBackend({ fixtures });
};

// ---- Latency simulation --------------------------------------------------------------------------

const MIN_LATENCY_MS = 150;
const LATENCY_JITTER_MS = 250;
// Unit tests pin it, so a response never lands in a later test; dev and e2e keep the random delay.
// Checked for blank, because Number("") is 0 and would pin the delay to nothing.
const rawFixedLatency = import.meta.env.VITE_FIXTURE_LATENCY_MS?.trim();
const FIXED_LATENCY_MS = rawFixedLatency ? Number(rawFixedLatency) : Number.NaN;
const simulatedLatency = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(
      resolve,
      Number.isFinite(FIXED_LATENCY_MS)
        ? FIXED_LATENCY_MS
        : MIN_LATENCY_MS + Math.random() * LATENCY_JITTER_MS,
    );
  });

// ---- Transport ------------------------------------------------------------------------------------

export const fixtureTransport: Transport = async (request) => {
  await simulatedLatency();
  const current = backend;
  const { status, body } = await current(request);
  if (request.method === "POST" && request.path === "/api/preferences" && status < 300) {
    const answer = await current({ method: "GET", path: "/api/preferences" });
    savePreferences(answer.body);
  }
  return {
    status,
    json: async (): Promise<unknown> => Promise.resolve(body),
  } satisfies TransportResponse;
};
