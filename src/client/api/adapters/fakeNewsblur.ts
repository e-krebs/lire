import {
  FeedsAnswerSchema,
  RefreshFeedsAnswerSchema,
  StoriesAnswerSchema,
  type FolderItem,
  type NewsblurFetch,
  type NewsblurRequest,
  type Params,
  type Story,
  type UpstreamFeed,
} from "shared/bff/upstream";

export const FAKE_USER_ID = 1001;

const FEED_PAGE_SIZE = 6;
const RIVER_PAGE_SIZE = 12;

// Raw NewsBlur answers, as seeded under `fixtures/seed/` or recorded under `fixtures/real/`.
export interface FakeNewsblurFixtures {
  feeds: unknown;
  refreshFeeds: unknown;
  // Keyed by feed id.
  stories: Record<string, unknown[]>;
  readStories: unknown[];
  feedAutocomplete: { feeds: { value: string; label: string; num_subscribers?: number }[] };
  preferences: { payload: Record<string, unknown> };
  profile: unknown;
  // The `/webfeed/status` answer of a finished analysis, minus `code` and `type`.
  webfeedAnalyze: unknown;
}

type Folders = FolderItem[];
type Folder = Record<string, Folders>;
type Answer = Record<string, unknown>;

const OK: Answer = { code: 1, result: "ok" };
const WEB_FEED_PREFIX = "webfeed:";
const FEED_ADDRESS = /(\/feed\/?|\.(xml|rss|atom))$/i;
// A page with this in its URL ends its analysis in an error.
const FAILING_PAGE = "broken";

const failure = (message: string): Answer => ({ code: -1, result: "error", message });

const one = ({ params, key }: { params: Params | undefined; key: string }): string => {
  const value = params?.[key];
  return (typeof value === "string" ? value : value?.[0]) ?? "";
};

const many = ({ params, key }: { params: Params | undefined; key: string }): string[] => {
  const value = params?.[key];
  return typeof value === "string" ? [value] : [...(value ?? [])];
};

const parsePaths = (raw: string): string[][] => {
  const parsed: unknown = JSON.parse(raw || "[]");
  if (!Array.isArray(parsed)) return [];
  return parsed.map((path: unknown) => (Array.isArray(path) ? path.map(String) : []));
};

const isFolder = (item: FolderItem): item is Folder => typeof item === "object";

// The children a folder path points at, `undefined` when a folder on the way is missing.
const childrenAt = ({ tree, path }: { tree: Folders; path: string[] }): Folders | undefined => {
  let level = tree;
  for (const title of path) {
    const folder = level.filter(isFolder).find((candidate) => title in candidate);
    if (!folder) return undefined;
    level = folder[title];
  }
  return level;
};

const removeFeed = ({ tree, path, feedId }: { tree: Folders; path: string[]; feedId: number }) => {
  const level = childrenAt({ tree, path });
  const index = level?.indexOf(feedId) ?? -1;
  if (!level || index === -1) return false;
  level.splice(index, 1);
  return true;
};

const containsFeed = ({ tree, feedId }: { tree: Folders; feedId: number }): boolean =>
  tree.some((item) =>
    isFolder(item)
      ? Object.values(item).some((children) => containsFeed({ tree: children, feedId }))
      : item === feedId,
  );

const parseStories = (stories: unknown[]): Story[] =>
  StoriesAnswerSchema.parse({ stories }).stories;

// An in-memory NewsBlur over a fixture set. It keeps folder, read and preference changes for as
// long as it lives, and answers the calls `shared/bff/handle.ts` makes.
export const createFakeNewsblur = ({
  fixtures,
}: {
  fixtures: FakeNewsblurFixtures;
}): NewsblurFetch => {
  const initial = FeedsAnswerSchema.parse(structuredClone(fixtures.feeds));
  const feeds: Record<string, UpstreamFeed> = initial.feeds;
  const tree: Folders = initial.folders;
  const baseCounts = RefreshFeedsAnswerSchema.parse(fixtures.refreshFeeds).feeds;
  const preferences = { ...fixtures.preferences.payload };

  const stories = new Map<string, Story>();
  const byFeed = new Map<string, Story[]>();
  for (const [feedId, list] of Object.entries(fixtures.stories)) {
    const parsed = parseStories(list);
    byFeed.set(feedId, parsed);
    for (const story of parsed) stories.set(story.story_hash, story);
  }
  const feedStories = (feedId: string) => byFeed.get(feedId) ?? [];

  // Newest read first.
  const readLog = parseStories(fixtures.readStories).map((story) => story.story_hash);
  const unread = new Set(
    [...stories.values()]
      .filter((story) => story.read_status === 0 && !readLog.includes(story.story_hash))
      .map((story) => story.story_hash),
  );
  const initiallyUnread = new Set(unread);

  const analyses = new Map<string, { polls: number; failing: boolean }>();
  let nextAnalysisId = 1;
  const startAnalysis = (url: string): Answer => {
    const requestId = `fake-analysis-${nextAnalysisId++}`;
    analyses.set(requestId, { polls: 0, failing: url.includes(FAILING_PAGE) });
    return { ...OK, request_id: requestId };
  };

  let nextFeedId = Math.max(0, ...Object.keys(feeds).map(Number)) + 1;

  const withState = (story: Story): Story => ({
    ...story,
    read_status: unread.has(story.story_hash) ? 0 : 1,
  });

  const filtered = ({ list, params }: { list: Story[]; params: Params }) => {
    const query = one({ params, key: "query" }).toLowerCase();
    const onlyUnread = one({ params, key: "read_filter" }) === "unread";
    const matches = [...list]
      .filter((story) => !onlyUnread || unread.has(story.story_hash))
      .filter((story) =>
        `${story.story_title ?? ""} ${story.story_content ?? ""}`.toLowerCase().includes(query),
      )
      .sort((a, b) => b.story_timestamp - a.story_timestamp);
    return one({ params, key: "order" }) === "oldest" ? matches.reverse() : matches;
  };

  // A single feed is fixed at 6 a page, as NewsBlur does; rivers honor `limit`.
  const paged = ({
    list,
    params,
    fixedSize,
  }: {
    list: Story[];
    params: Params;
    fixedSize?: number;
  }) => {
    const page = Math.max(1, Number(one({ params, key: "page" })) || 1);
    const size = fixedSize ?? (Number(one({ params, key: "limit" })) || RIVER_PAGE_SIZE);
    const items = filtered({ list, params }).slice((page - 1) * size, page * size);
    return { stories: items.map(withState) };
  };

  const folderEntries = (title: string) => tree.filter(isFolder).filter((item) => title in item);

  const addUrl = ({ form, webFeed }: { form: Params | undefined; webFeed?: boolean }): Answer => {
    const url = one({ params: form, key: "url" });
    if (!URL.canParse(url)) return failure("Could not find a feed at that address.");
    const folder = one({ params: form, key: "folder" });
    const level = childrenAt({ tree, path: folder === "" ? [] : [folder] });
    if (!level) return failure("Folder not found.");
    const address = webFeed ? `${WEB_FEED_PREFIX}${url}` : url;
    const existing = Object.values(feeds).find((candidate) => candidate.feed_address === address);
    // A web feed already followed only swaps its variant: it stays where it is.
    if (existing && webFeed) return { ...OK, feed: existing };
    const feed: UpstreamFeed = existing ?? {
      id: nextFeedId++,
      feed_title: one({ params: form, key: "feed_title" }) || new URL(url).hostname,
      feed_address: address,
      feed_link: webFeed ? url : new URL(url).origin,
      favicon_url: null,
      ...(webFeed ? { is_webfeed: true } : {}),
    };
    feeds[String(feed.id)] = feed;
    if (!level.includes(feed.id)) level.push(feed.id);
    return { ...OK, feed };
  };

  const moveFeed = (form: Params | undefined): Answer => {
    const feedId = Number(one({ params: form, key: "feed_id" }));
    const from = parsePaths(one({ params: form, key: "in_folder_paths" }));
    const to = parsePaths(one({ params: form, key: "to_folder_paths" }));
    if (to.some((path) => !childrenAt({ tree, path }))) return failure("Folder not found.");
    for (const path of from) {
      if (!removeFeed({ tree, path, feedId })) return failure("Feed is not in that folder.");
    }
    for (const path of to) {
      const level = childrenAt({ tree, path });
      if (level && !level.includes(feedId)) level.push(feedId);
    }
    return OK;
  };

  const deleteFeed = (form: Params | undefined): Answer => {
    const feedId = Number(one({ params: form, key: "feed_id" }));
    const [path = []] = parsePaths(`[${one({ params: form, key: "folder_path" }) || "[]"}]`);
    if (!removeFeed({ tree, path, feedId })) return failure("Feed is not in that folder.");
    if (!containsFeed({ tree, feedId })) delete feeds[String(feedId)];
    return OK;
  };

  const write = ({ path, form }: NewsblurRequest): Answer => {
    switch (path) {
      case "/reader/add_folder": {
        const title = one({ params: form, key: "folder" });
        if (folderEntries(title).length > 0) return failure("Folder already exists.");
        tree.push({ [title]: [] });
        return OK;
      }
      case "/reader/rename_folder": {
        const target = one({ params: form, key: "new_folder_name" });
        const entries = folderEntries(one({ params: form, key: "folder_to_rename" }));
        if (entries.length === 0) return failure("Folder not found.");
        for (const entry of entries) {
          for (const [title, children] of Object.entries(entry)) {
            delete entry[title];
            entry[target] = children;
          }
        }
        return OK;
      }
      case "/reader/delete_folder":
        for (const entry of folderEntries(one({ params: form, key: "folder_to_delete" }))) {
          tree.splice(tree.indexOf(entry), 1);
        }
        return OK;
      case "/reader/add_url":
        return addUrl({ form });
      case "/webfeed/subscribe":
        return addUrl({ form, webFeed: true });
      case "/webfeed/analyze": {
        const url = one({ params: form, key: "url" });
        if (!URL.canParse(url)) return failure("Could not read that address.");
        if (FEED_ADDRESS.test(new URL(url).pathname)) return { code: 2, feed_address: url };
        return startAnalysis(url);
      }
      case "/webfeed/reanalyze": {
        const feed = feeds[one({ params: form, key: "feed_id" })] as UpstreamFeed | undefined;
        if (!feed?.is_webfeed) return failure("Feed not found.");
        return startAnalysis(feed.feed_address.slice(WEB_FEED_PREFIX.length));
      }
      case "/reader/rename_feed": {
        const feed = feeds[one({ params: form, key: "feed_id" })] as UpstreamFeed | undefined;
        if (!feed) return failure("Feed not found.");
        feed.feed_title = one({ params: form, key: "feed_title" });
        return OK;
      }
      case "/reader/move_feed_to_folders":
        return moveFeed(form);
      case "/reader/delete_feed":
        return deleteFeed(form);
      case "/reader/mark_story_hashes_as_read":
        for (const hash of many({ params: form, key: "story_hash" })) {
          if (!stories.has(hash)) continue;
          unread.delete(hash);
          readLog.unshift(hash);
        }
        return OK;
      case "/reader/mark_story_hash_as_unread": {
        const hash = one({ params: form, key: "story_hash" });
        if (!stories.has(hash)) return failure("Story not found.");
        unread.add(hash);
        readLog.splice(0, readLog.length, ...readLog.filter((logged) => logged !== hash));
        return OK;
      }
      case "/profile/set_preference":
        for (const key of Object.keys(form ?? {})) preferences[key] = one({ params: form, key });
        return OK;
      default:
        return failure(`Unknown write ${path}.`);
    }
  };

  const refreshFeeds = (): Answer => {
    const counts: Record<string, { ps: number; nt: number; ng: number }> = {};
    for (const [feedId, base] of Object.entries(baseCounts)) {
      const list = feedStories(feedId);
      const delta =
        list.filter((story) => unread.has(story.story_hash)).length -
        list.filter((story) => initiallyUnread.has(story.story_hash)).length;
      counts[feedId] = { ...base, ps: Math.max(0, base.ps + delta) };
    }
    return { feeds: counts };
  };

  // The first poll answers pending, the next the end of the analysis.
  const webFeedStatus = (requestId: string): Answer => {
    const analysis = analyses.get(requestId);
    if (!analysis) return { code: -1, status: "unknown" };
    analysis.polls += 1;
    if (analysis.polls < 2) return { code: 1, type: "progress", message: "Reading the page." };
    if (analysis.failing) return { code: -1, type: "error", error: "Could not read the page." };
    return { code: 1, type: "complete", ...asRecord(fixtures.webfeedAnalyze) };
  };

  const read = ({ path, query, form }: NewsblurRequest): Answer | undefined => {
    const params: Params = { ...query, ...form };
    if (path === "/webfeed/status") return webFeedStatus(one({ params, key: "request_id" }));
    if (path === "/reader/feeds") return { feeds, folders: tree };
    if (path === "/reader/refresh_feeds") return refreshFeeds();
    if (path === "/reader/read_stories") {
      const list = readLog.flatMap((hash) => stories.get(hash) ?? []);
      return paged({ list, params });
    }
    if (path.startsWith("/reader/feed/")) {
      const list = feedStories(path.slice("/reader/feed/".length));
      return paged({ list, params, fixedSize: FEED_PAGE_SIZE });
    }
    if (path === "/reader/river_stories") {
      const hashes = many({ params, key: "h" });
      if (hashes.length > 0) {
        return { stories: hashes.flatMap((hash) => stories.get(hash) ?? []).map(withState) };
      }
      return paged({ list: many({ params, key: "feeds" }).flatMap(feedStories), params });
    }
    if (path === "/rss_feeds/feed_autocomplete") {
      const term = one({ params, key: "term" }).toLowerCase();
      const matches = fixtures.feedAutocomplete.feeds.filter((feed) =>
        `${feed.label} ${feed.value}`.toLowerCase().includes(term),
      );
      return { feeds: matches };
    }
    if (path === "/profile/get_preference") return { payload: preferences };
    if (path === "/social/load_user_profile") return asRecord(fixtures.profile);
    return undefined;
  };

  const respond = (request: NewsblurRequest): Response => {
    // A river is a POST that only reads.
    const answer =
      request.method === "GET" || request.path === "/reader/river_stories"
        ? read(request)
        : write(request);
    if (answer === undefined) return new Response("Not found", { status: 404 });
    return Response.json({ result: "ok", authenticated: true, user_id: FAKE_USER_ID, ...answer });
  };

  return async (request) => Promise.resolve(respond(request));
};

const asRecord = (value: unknown): Answer =>
  typeof value === "object" && value !== null ? { ...value } : {};
