import { matchRoute } from "shared/feedsApi/routes";
import { handle, type BffResponse, type FeedsCache } from "shared/bff/handle";
import type { FeedsAnswer, NewsblurFetch, NewsblurRequest } from "shared/bff/upstream";

// Each case passes its own NewsBlur answers, keyed "METHOD /path". An object answer gets the
// session fields NewsBlur's json_view adds; a Response goes out as-is.

export const USER_ID = 42;

export interface FakeUpstream {
  fetch: NewsblurFetch;
  calls: NewsblurRequest[];
}

const asResponse = (reply: unknown): Response => {
  if (reply instanceof Response) return reply;
  const body =
    typeof reply === "object" && reply !== null && !Array.isArray(reply)
      ? { result: "ok", authenticated: true, user_id: USER_ID, ...reply }
      : reply;
  return Response.json(body);
};

export const fakeUpstream = (replies: Record<string, unknown>): FakeUpstream => {
  const calls: NewsblurRequest[] = [];
  const fetch: NewsblurFetch = async (request) => {
    calls.push(request);
    const reply = replies[`${request.method} ${request.path}`];
    if (reply === undefined) {
      return Promise.reject(new Error(`unexpected ${request.method} ${request.path}`));
    }
    return Promise.resolve(asResponse(reply));
  };
  return { fetch, calls };
};

export interface MemoryCache extends FeedsCache {
  value: unknown;
  clears: number;
  generation: number;
}

export const memoryCache = (initial?: FeedsAnswer): MemoryCache => {
  const cache: MemoryCache = {
    value: initial,
    clears: 0,
    generation: 0,
    get: async () => Promise.resolve({ value: cache.value, generation: cache.generation }),
    set: async ({ value, generation }) => {
      if (generation === cache.generation) cache.value = value;
      return Promise.resolve();
    },
    clear: async () => {
      cache.value = undefined;
      cache.generation += 1;
      cache.clears += 1;
      return Promise.resolve();
    },
  };
  return cache;
};

export const send = async ({
  method = "GET",
  url,
  body,
  upstream,
  cache = memoryCache(),
  newsletterAddress = "demo-0000@newsletters.newsblur.com",
}: {
  method?: string;
  url: string;
  body?: unknown;
  upstream: FakeUpstream;
  cache?: FeedsCache;
  newsletterAddress?: string;
}): Promise<BffResponse> => {
  const parsed = new URL(url, "https://lire.test");
  const match = matchRoute({ method, pathname: parsed.pathname });
  if (!match) throw new Error(`no route for ${method} ${url}`);
  return handle({
    route: match.route,
    params: match.params,
    query: parsed.searchParams,
    body,
    upstream: upstream.fetch,
    config: { newsletterAddress, userId: USER_ID },
    cache,
  });
};

// Four feeds in the tree, one orphaned subscription (9) and one tree id with no feed (7).
// Feed 2 sits in a nested folder and in News; Tech appears twice at the top level.
export const FEEDS_ANSWER = {
  feeds: {
    "1": {
      id: 1,
      feed_title: "Alpha",
      feed_address: "https://a.example/feed",
      feed_link: "https://a.example",
      favicon_url: "/rss_feeds/icon/1",
    },
    "2": {
      id: 2,
      feed_title: "Beta",
      feed_address: "https://b.example/feed",
      feed_link: null,
      favicon_url: "https://s3.amazonaws.com/icons/2.png",
    },
    "3": { id: 3, feed_title: "Letters", feed_address: "newsletter:abc", favicon_url: null },
    "4": { id: 4, feed_title: "Root", feed_address: "https://d.example/feed" },
    "9": { id: 9, feed_title: "Orphan", feed_address: "https://o.example/feed" },
  },
  folders: [4, { Tech: [1, { Deep: [2] }] }, { News: [2, 3, 7] }, { Empty: [] }, { Tech: [3] }],
};

export const story = (overrides: Record<string, unknown> = {}) => ({
  story_hash: "1:abc",
  story_feed_id: 1,
  story_title: "Hello",
  story_authors: "Ada",
  story_content: "<p>Body</p>",
  story_permalink: "https://a.example/hello",
  story_timestamp: "1700000000",
  image_urls: ["https://a.example/1.png"],
  read_status: 0,
  ...overrides,
});
