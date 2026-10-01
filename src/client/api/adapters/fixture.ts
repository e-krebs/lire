import { z } from "zod";
import { matchAllowed } from "shared/feedsApi/paths";
import {
  categoryStreamId,
  globalAllStreamId,
  globalUncategorizedStreamId,
  globalReadStreamId,
  isFeedStreamId,
  feedStreamId,
} from "shared/feedsApi/streams";
import {
  CollectionSchema,
  SubscriptionSchema,
  ProfileSchema,
  StreamContentsSchema,
  FeedSearchResponseSchema,
  PreferencesSchema,
} from "shared/feedsApi/types";
import type {
  Collection,
  Subscription,
  Profile,
  Entry,
  MarkerCounts,
  StreamContents,
  FeedSearchResponse,
  Feed,
} from "shared/feedsApi/types";
import { textSnippet } from "client/utils/html";
import type { Transport, TransportResponse } from "client/api/transport";

// ---- Fixture loading --------------------------------------------------------------------------

// `real/` stays out of production builds: Vite drops the dead branch, so the recording is never bundled.
const modules = {
  ...import.meta.glob<{ default: unknown }>("/fixtures/seed/**/*.json", { eager: true }),
  ...(import.meta.env.DEV
    ? import.meta.glob<{ default: unknown }>("/fixtures/real/**/*.json", { eager: true })
    : {}),
};

const relativeTo = ({ dir, path }: { dir: "real" | "seed"; path: string }): string | undefined => {
  const marker = `/fixtures/${dir}/`;
  const index = path.indexOf(marker);
  return index === -1 ? undefined : path.slice(index + marker.length);
};

// `real/` is gitignored, written by scripts/record-fixtures.ts from a live account — only trust it
// once it holds every file the app actually needs; a half-recorded run falls back to `seed/`.
const REQUIRED_REAL_FILES = [
  "profile.json",
  "collections.json",
  "subscriptions.json",
  "markers-counts.json",
];

const realRelativePaths = Object.keys(modules)
  .map((path) => relativeTo({ dir: "real", path }))
  .filter((relative): relative is string => relative !== undefined);

const realIsComplete =
  REQUIRED_REAL_FILES.every((file) => realRelativePaths.includes(file)) &&
  realRelativePaths.some((path) => /^streams\/.+\.json$/.test(path));

if (realRelativePaths.length > 0 && !realIsComplete) {
  console.warn("fixtures/real/ is missing required files — falling back to fixtures/seed/.");
}

// `VITE_FIXTURES=seed` keeps the synthetic data even when a recording exists: e2e runs on it, and
// a live account with nothing unread is no place to work on the unread-only grid.
const sourceDir: "real" | "seed" =
  realIsComplete && import.meta.env.VITE_FIXTURES !== "seed" ? "real" : "seed";

const loaded = new Map<string, unknown>();
for (const [path, mod] of Object.entries(modules)) {
  const relative = relativeTo({ dir: sourceDir, path });
  if (relative !== undefined) loaded.set(relative, mod.default);
}
// search-feeds.json is optional in `real/` — fall back to the committed seed's copy.
if (!loaded.has("search-feeds.json")) {
  for (const [path, mod] of Object.entries(modules)) {
    if (relativeTo({ dir: "seed", path }) === "search-feeds.json")
      loaded.set("search-feeds.json", mod.default);
  }
}

const streamFiles = new Map<string, unknown>();
for (const [relative, content] of loaded) {
  const match = /^streams\/(.+)\.json$/.exec(relative);
  if (match) streamFiles.set(match[1], content);
}

const profile: Profile = ProfileSchema.parse(loaded.get("profile.json"));
const collectionsSeed: Collection[] = z
  .array(CollectionSchema)
  .parse(loaded.get("collections.json"));
const searchFeedsSeed: FeedSearchResponse = FeedSearchResponseSchema.parse(
  loaded.get("search-feeds.json"),
);

const buildSubscriptionsState = (): Subscription[] =>
  z.array(SubscriptionSchema).parse(loaded.get("subscriptions.json"));

// The bucket is the one fixture mutation that outlives a reload: it stands in for the account, and
// the flags it holds ("Opens on its site") were set by hand. A recorded `real/preferences.json`
// seeds it; the seed has none, so mock mode starts empty.
const PREFERENCES_STORAGE_KEY = "lire.fixture.preferences";

const buildPreferencesState = (): Record<string, unknown> => {
  try {
    const stored = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (stored !== null) return PreferencesSchema.parse(JSON.parse(stored));
  } catch {
    // Blocked storage or a hand-edited value: fall through to the fixture.
  }
  const raw = loaded.get("preferences.json");
  return raw === undefined ? {} : PreferencesSchema.parse(raw);
};

const savePreferencesState = (): void => {
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferencesState));
  } catch {
    // A private window or a full quota: the bucket still holds for this session.
  }
};

const buildEntriesPool = (): Entry[] => {
  const byId = new Map<string, Entry>();
  for (const content of streamFiles.values()) {
    const parsed: StreamContents = StreamContentsSchema.parse(content);
    for (const item of parsed.items) byId.set(item.id, item);
  }
  return [...byId.values()];
};

interface CategoryMeta {
  label: string;
  description?: string;
  cover?: string;
  created?: number;
}

const buildCategoryMeta = (): Map<string, CategoryMeta> =>
  new Map(
    collectionsSeed.map((collection) => [
      collection.id,
      {
        label: collection.label,
        description: collection.description,
        cover: collection.cover,
        created: collection.created,
      },
    ]),
  );

// `StreamContentsSchema.parse`/`SubscriptionSchema.parse` build fresh objects from the loaded JSON
// each time, so re-running these against the untouched source data is enough to undo in-place
// mutations (`markEntriesUnread`, `postSubscription`, …) from earlier requests.
const subscriptionsState: Subscription[] = buildSubscriptionsState();
const entriesPool: Entry[] = buildEntriesPool();
const categoryMeta = buildCategoryMeta();
const preferencesState: Record<string, unknown> = buildPreferencesState();

const userId = profile.id;
const globalAllId = globalAllStreamId(userId);
const globalUncategorizedId = globalUncategorizedStreamId(userId);
const globalReadId = globalReadStreamId(userId);

// ---- Derived, live state -----------------------------------------------------------------------

const categoryIdsForFeed = (feedId: string): string[] => {
  const subscription = subscriptionsState.find((sub) => sub.id === feedId);
  return subscription ? subscription.categories.map((category) => category.id) : [];
};

const deriveCollections = (): Collection[] => {
  const feedsByCategory = new Map<string, Feed[]>();
  for (const id of categoryMeta.keys()) feedsByCategory.set(id, []);

  for (const subscription of subscriptionsState) {
    for (const category of subscription.categories) {
      if (!categoryMeta.has(category.id)) {
        categoryMeta.set(category.id, {
          label: category.label ?? category.id.split("/").pop() ?? category.id,
          created: Date.now(),
        });
        feedsByCategory.set(category.id, []);
      }
      // Live collections[].feeds carry `feedId` (= id) while /v3/subscriptions items don't.
      const feed: Feed = {
        id: subscription.id,
        feedId: subscription.id,
        title: subscription.title,
        website: subscription.website,
        iconUrl: subscription.iconUrl,
        visualUrl: subscription.visualUrl,
        subscribers: subscription.subscribers,
        updated: subscription.updated,
        velocity: subscription.velocity,
        topics: subscription.topics,
        state: subscription.state,
      };
      feedsByCategory.get(category.id)?.push(feed);
    }
  }

  return [...categoryMeta.entries()].map(([id, meta]) => ({
    id,
    label: meta.label,
    description: meta.description,
    cover: meta.cover,
    created: meta.created,
    feeds: feedsByCategory.get(id) ?? [],
  }));
};

// The feeds API's built-in `global.uncategorized` holds every feed outside any category.
const feedInCategory = ({
  feedId,
  categoryId,
}: {
  feedId: string;
  categoryId: string;
}): boolean => {
  const categoryIds = categoryIdsForFeed(feedId);
  return categoryId === globalUncategorizedId
    ? categoryIds.length === 0
    : categoryIds.includes(categoryId);
};

const filterStreamEntries = ({
  streamId,
  unreadOnly,
}: {
  streamId: string;
  unreadOnly: boolean;
}): Entry[] => {
  // The recently-read tag is read entries by definition, so `unreadOnly` has nothing to filter.
  if (streamId === globalReadId) return entriesPool.filter((entry) => !entry.unread);
  const scoped =
    streamId === globalAllId
      ? entriesPool
      : isFeedStreamId(streamId)
        ? entriesPool.filter((entry) => entry.origin.streamId === streamId)
        : entriesPool.filter((entry) =>
            feedInCategory({ feedId: entry.origin.streamId, categoryId: streamId }),
          );
  return unreadOnly ? scoped.filter((entry) => entry.unread) : scoped;
};

// The read stream orders by when the entry was read, everything else by publication (newsletters
// have no `published`, so they fall back to `crawled` like the feeds API does).
const sortEntries = ({
  entries,
  ranked,
  streamId,
}: {
  entries: Entry[];
  ranked: "newest" | "oldest";
  streamId: string;
}): Entry[] => {
  const key = (entry: Entry): number =>
    streamId === globalReadId
      ? (entry.actionTimestamp ?? entry.crawled)
      : (entry.published ?? entry.crawled);
  return [...entries].sort((a, b) => (ranked === "oldest" ? key(a) - key(b) : key(b) - key(a)));
};

// The feeds API matches the article text; the pool holds HTML bodies, so compare on the plain text.
const searchableText = (entry: Entry): string =>
  [
    entry.title,
    textSnippet(entry.summary?.content),
    textSnippet(entry.content?.content),
    entry.author,
    entry.origin.title,
    ...(entry.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();

const CONTINUATION_PREFIX = "after:";

// Encodes the last returned entry id rather than a raw offset: an index-based cursor drifts once
// `unreadOnly` filtering shrinks the list between two calls (e.g. an entry got marked read).
const decodeAfterId = (continuation: string | undefined): string | undefined =>
  continuation?.startsWith(CONTINUATION_PREFIX)
    ? continuation.slice(CONTINUATION_PREFIX.length)
    : undefined;

const encodeAfterId = (entryId: string): string => `${CONTINUATION_PREFIX}${entryId}`;

// Falls back to the start of the list when the id isn't found (e.g. it dropped out of an
// `unreadOnly` filter since the previous page).
const startIndexAfter = ({
  entries,
  afterId,
}: {
  entries: Entry[];
  afterId: string | undefined;
}): number => {
  if (afterId === undefined) return 0;
  const index = entries.findIndex((entry) => entry.id === afterId);
  return index === -1 ? 0 : index + 1;
};

const buildUnreadCounts = (): MarkerCounts => {
  const now = Date.now();
  const categoryCounts = new Map<string, number>();
  for (const id of categoryMeta.keys()) categoryCounts.set(id, 0);
  const feedCounts = new Map<string, number>();
  for (const subscription of subscriptionsState) feedCounts.set(subscription.id, 0);

  let globalCount = 0;
  for (const entry of entriesPool) {
    if (!entry.unread) continue;
    globalCount += 1;
    feedCounts.set(entry.origin.streamId, (feedCounts.get(entry.origin.streamId) ?? 0) + 1);
    for (const categoryId of categoryIdsForFeed(entry.origin.streamId)) {
      categoryCounts.set(categoryId, (categoryCounts.get(categoryId) ?? 0) + 1);
    }
  }

  return {
    updated: now,
    unreadcounts: [
      { id: globalAllId, count: globalCount, updated: now },
      ...[...categoryCounts.entries()].map(([id, count]) => ({ id, count, updated: now })),
      ...[...feedCounts.entries()].map(([id, count]) => ({ id, count, updated: now })),
    ],
  };
};

const markEntriesUnread = ({ entryIds, unread }: { entryIds: string[]; unread: boolean }): void => {
  const now = Date.now();
  for (const entry of entriesPool) {
    if (!entryIds.includes(entry.id)) continue;
    entry.unread = unread;
    // The feeds API stamps the read action, which is what orders the recently-read tag.
    if (!unread) entry.actionTimestamp = now;
  }
};

const markFeedRead = ({ feedId, asOf }: { feedId: string; asOf: number | undefined }): void => {
  for (const entry of entriesPool) {
    if (entry.origin.streamId === feedId && (asOf === undefined || entry.crawled <= asOf)) {
      entry.unread = false;
    }
  }
};

const markCategoryRead = ({
  categoryId,
  asOf,
}: {
  categoryId: string;
  asOf: number | undefined;
}): void => {
  for (const entry of entriesPool) {
    const inCategory =
      categoryId === globalAllId || feedInCategory({ feedId: entry.origin.streamId, categoryId });
    if (inCategory && (asOf === undefined || entry.crawled <= asOf)) entry.unread = false;
  }
};

// ---- Request body validation --------------------------------------------------------------------

const MarkerActionSchema = z.union([
  z.object({
    action: z.literal("markAsRead"),
    type: z.literal("entries"),
    entryIds: z.array(z.string()),
    asOf: z.number().optional(),
  }),
  z.object({
    action: z.literal("markAsRead"),
    type: z.literal("feeds"),
    feedIds: z.array(z.string()),
    asOf: z.number().optional(),
  }),
  z.object({
    action: z.literal("markAsRead"),
    type: z.literal("categories"),
    categoryIds: z.array(z.string()),
    asOf: z.number().optional(),
  }),
  z.object({
    action: z.literal("keepUnread"),
    type: z.literal("entries"),
    entryIds: z.array(z.string()),
    asOf: z.number().optional(),
  }),
]);

const applyMarkerAction = (action: z.infer<typeof MarkerActionSchema>): void => {
  if (action.action === "keepUnread") {
    markEntriesUnread({ entryIds: action.entryIds, unread: true });
    return;
  }
  if (action.type === "entries") {
    markEntriesUnread({ entryIds: action.entryIds, unread: false });
    return;
  }
  if (action.type === "feeds") {
    for (const feedId of action.feedIds) markFeedRead({ feedId, asOf: action.asOf });
    return;
  }
  for (const categoryId of action.categoryIds) markCategoryRead({ categoryId, asOf: action.asOf });
};

const PreferencesInputSchema = z.record(z.string(), z.unknown());

// The feeds API's own sentinel value for "remove this key".
const PREFERENCE_DELETE_VALUE = "==DELETE==";

const CollectionInputSchema = z.object({ id: z.string().optional(), label: z.string() });

const SubscriptionInputSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  categories: z.array(z.object({ id: z.string(), label: z.string().optional() })).optional(),
});

const isUrlLike = (value: string): boolean =>
  /^https?:\/\//i.test(value) || /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(value);

const MputInputSchema = z.array(z.object({ id: z.string(), title: z.string().optional() }));

let newsletterCounter = 0;

// Re-derives the live state from the loaded fixtures — for tests, so each one starts from the same
// baseline instead of depending on mutations left over by whichever test ran before it.
export const resetFixtureState = (): void => {
  entriesPool.splice(0, entriesPool.length, ...buildEntriesPool());
  subscriptionsState.splice(0, subscriptionsState.length, ...buildSubscriptionsState());
  newsletterCounter = 0;
  categoryMeta.clear();
  for (const [id, meta] of buildCategoryMeta()) categoryMeta.set(id, meta);
  for (const key of Object.keys(preferencesState)) delete preferencesState[key];
  try {
    window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
  } catch {
    // Nothing stored, nothing to forget.
  }
  Object.assign(preferencesState, buildPreferencesState());
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

const jsonResponse = ({ status, body }: { status: number; body: unknown }): TransportResponse => ({
  status,
  json: async (): Promise<unknown> => Promise.resolve(body),
});

// ---- Transport ------------------------------------------------------------------------------------

export const fixtureTransport: Transport = async ({ method, path, query, body }) => {
  await simulatedLatency();
  const match = matchAllowed({ method, pathname: path });
  if (!match) {
    return jsonResponse({
      status: 404,
      body: { error: "not_found" },
    });
  }

  switch (`${method} ${match.pattern}`) {
    case "GET /v3/profile":
      return jsonResponse({ status: 200, body: profile });

    case "GET /v3/collections":
      return jsonResponse({
        status: 200,
        body: deriveCollections(),
      });

    // Creates when the body carries no `id` (a fresh category id is derived from the label);
    // renames in place when `id` names an existing category. Either way, the feeds API answers
    // with a one-element array — mirroring that here keeps the client's `.at(0)` unwrap identical.
    case "POST /v3/collections": {
      const input = CollectionInputSchema.parse(body);
      const id = input.id ?? categoryStreamId({ userId, label: input.label });
      const existing = categoryMeta.get(id);
      categoryMeta.set(
        id,
        existing
          ? { ...existing, label: input.label }
          : { label: input.label, created: Date.now() },
      );
      if (existing) {
        for (const subscription of subscriptionsState) {
          for (const category of subscription.categories) {
            if (category.id === id) category.label = input.label;
          }
        }
      }
      const collection = deriveCollections().find((c) => c.id === id);
      return jsonResponse({
        status: 200,
        body: collection ? [collection] : [],
      });
    }

    case "DELETE /v3/collections/:collectionId": {
      const collectionId = decodeURIComponent(match.params.collectionId);
      categoryMeta.delete(collectionId);
      // The live feeds API unsubscribes every feed whose only category this was.
      for (let index = subscriptionsState.length - 1; index >= 0; index--) {
        const subscription = subscriptionsState[index];
        if (!subscription.categories.some((category) => category.id === collectionId)) continue;
        subscription.categories = subscription.categories.filter(
          (category) => category.id !== collectionId,
        );
        if (subscription.categories.length === 0) subscriptionsState.splice(index, 1);
      }
      // The live feeds API answers `null` here.
      return jsonResponse({ status: 200, body: null });
    }

    case "GET /v3/subscriptions":
      return jsonResponse({
        status: 200,
        body: subscriptionsState,
      });

    case "GET /v3/markers/counts":
      return jsonResponse({
        status: 200,
        body: buildUnreadCounts(),
      });

    case "GET /v3/streams/contents": {
      if (typeof query?.streamId !== "string") {
        return jsonResponse({
          status: 404,
          body: { error: "not_found" },
        });
      }
      const streamId = query.streamId;
      const unreadOnly = query.unreadOnly === true;
      const ranked = query.ranked === "oldest" ? "oldest" : "newest";
      const count = typeof query.count === "number" ? query.count : 20;
      const afterId = decodeAfterId(
        typeof query.continuation === "string" ? query.continuation : undefined,
      );

      const filtered = sortEntries({
        entries: filterStreamEntries({ streamId, unreadOnly }),
        ranked,
        streamId,
      });
      const startIndex = startIndexAfter({ entries: filtered, afterId });
      const page = filtered.slice(startIndex, startIndex + count);
      const lastItem = page.at(-1);
      const continuation =
        startIndex + page.length < filtered.length && lastItem
          ? encodeAfterId(lastItem.id)
          : undefined;

      const responseBody: StreamContents = {
        id: streamId,
        updated: Date.now(),
        items: page,
        ...(continuation !== undefined ? { continuation } : {}),
      };
      return jsonResponse({ status: 200, body: responseBody });
    }

    // The paid plan's article search. Same response shape as streams/contents, scoped the same way.
    case "GET /v3/search/contents": {
      const streamId = typeof query?.streamId === "string" ? query.streamId : "";
      const queryText = typeof query?.query === "string" ? query.query.trim() : "";
      if (streamId === "" || queryText === "") {
        return jsonResponse({
          status: 400,
          body: { error: "bad_request" },
        });
      }
      const unreadOnly = query?.unreadOnly === true;
      const count = typeof query?.count === "number" ? query.count : 20;
      const afterId = decodeAfterId(
        typeof query?.continuation === "string" ? query.continuation : undefined,
      );

      const needle = queryText.toLowerCase();
      const matched = filterStreamEntries({ streamId, unreadOnly }).filter((entry) =>
        searchableText(entry).includes(needle),
      );
      const sorted = sortEntries({ entries: matched, ranked: "newest", streamId });
      const startIndex = startIndexAfter({ entries: sorted, afterId });
      const page = sorted.slice(startIndex, startIndex + count);
      const lastItem = page.at(-1);
      const continuation =
        startIndex + page.length < sorted.length && lastItem
          ? encodeAfterId(lastItem.id)
          : undefined;

      const responseBody: StreamContents = {
        id: streamId,
        updated: Date.now(),
        items: page,
        ...(continuation !== undefined ? { continuation } : {}),
      };
      return jsonResponse({ status: 200, body: responseBody });
    }

    case "GET /v3/entries/:entryId": {
      const entryId = decodeURIComponent(match.params.entryId);
      const entry = entriesPool.find((item) => item.id === entryId);
      if (!entry) {
        return jsonResponse({
          status: 404,
          body: { error: "not_found" },
        });
      }
      // The feeds API wraps a single entry in an array.
      return jsonResponse({ status: 200, body: [entry] });
    }

    case "POST /v3/markers": {
      applyMarkerAction(MarkerActionSchema.parse(body));
      return jsonResponse({ status: 200, body: {} });
    }

    case "GET /v3/preferences":
      return jsonResponse({ status: 200, body: preferencesState });

    // A partial body merges in and the whole store comes back; the live feeds API refuses a null
    // value.
    case "POST /v3/preferences": {
      const patch = PreferencesInputSchema.parse(body);
      if (Object.values(patch).includes(null)) {
        return jsonResponse({
          status: 400,
          body: { errorCode: 400, errorMessage: "invalid preferences" },
        });
      }
      for (const [key, value] of Object.entries(patch)) {
        if (value === PREFERENCE_DELETE_VALUE) delete preferencesState[key];
        else preferencesState[key] = value;
      }
      savePreferencesState();
      return jsonResponse({ status: 200, body: preferencesState });
    }

    case "GET /v3/search/feeds": {
      const queryText = typeof query?.query === "string" ? query.query : "";
      const results = isUrlLike(queryText)
        ? [
            ...searchFeedsSeed.results,
            { feedId: feedStreamId(queryText), title: queryText, website: queryText },
          ]
        : searchFeedsSeed.results;
      const responseBody: FeedSearchResponse = {
        results,
        hint: searchFeedsSeed.hint,
        related: searchFeedsSeed.related,
      };
      return jsonResponse({ status: 200, body: responseBody });
    }

    // The live feeds API answers both create and update with a one-element array.
    case "POST /v3/subscriptions": {
      const input = SubscriptionInputSchema.parse(body);
      const existing = subscriptionsState.find((sub) => sub.id === input.id);
      const categories = input.categories ?? existing?.categories ?? [];
      // The live feeds API reads an empty set as an unsubscribe, and ignores it for a feed nobody
      // follows.
      if (input.categories?.length === 0) {
        if (existing) subscriptionsState.splice(subscriptionsState.indexOf(existing), 1);
        return jsonResponse({ status: 200, body: [] });
      }
      if (existing) {
        existing.title = input.title ?? existing.title;
        existing.categories = categories;
        return jsonResponse({ status: 200, body: [existing] });
      }
      const created: Subscription = {
        id: input.id,
        title: input.title ?? input.id,
        categories,
      };
      subscriptionsState.push(created);
      return jsonResponse({ status: 200, body: [created] });
    }

    case "DELETE /v3/subscriptions/:feedId": {
      const feedId = decodeURIComponent(match.params.feedId);
      const index = subscriptionsState.findIndex((sub) => sub.id === feedId);
      if (index !== -1) subscriptionsState.splice(index, 1);
      // The live feeds API answers `[]` here.
      return jsonResponse({ status: 200, body: [] });
    }

    case "POST /v3/feeds/newsletters": {
      newsletterCounter += 1;
      const id = `fixture${String(newsletterCounter).padStart(4, "0")}`;
      return jsonResponse({
        status: 200,
        body: {
          emailAddress: `${id}@newsletters.example`,
          feedId: `feed/https://newsletters.example/email/${id}`,
        },
      });
    }

    case "POST /v3/collections/:collectionId/feeds/.mput": {
      const collectionId = decodeURIComponent(match.params.collectionId);
      const meta = categoryMeta.get(collectionId);
      if (!meta) return jsonResponse({ status: 404, body: { error: "not_found" } });
      for (const input of MputInputSchema.parse(body)) {
        const existing = subscriptionsState.find((sub) => sub.id === input.id);
        if (!existing) {
          subscriptionsState.push({
            id: input.id,
            title: input.title ?? input.id,
            categories: [{ id: collectionId, label: meta.label }],
          });
        } else if (!existing.categories.some((category) => category.id === collectionId)) {
          existing.categories = [...existing.categories, { id: collectionId, label: meta.label }];
        }
      }
      return jsonResponse({ status: 200, body: null });
    }

    default:
      return jsonResponse({
        status: 404,
        body: { error: "not_found" },
      });
  }
};
