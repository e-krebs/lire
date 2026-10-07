import { z } from "zod";
import { CATEGORY_ORDER_KEY } from "shared/feedsApi/preferences";
import type { Route } from "shared/feedsApi/routes";
import { parseStreamKey, type Stream } from "shared/feedsApi/streamKey";
import {
  AnalyzeWebFeedBodySchema,
  CategoryBodySchema,
  CreateFeedBodySchema,
  CreateWebFeedBodySchema,
  DeleteCategoryQuerySchema,
  MarkBodySchema,
  PreferencesUpdateSchema,
  SearchEntriesQuerySchema,
  SearchFeedsQuerySchema,
  StreamEntriesQuerySchema,
  SunPhaseSchema,
  SunQuerySchema,
  UpdateFeedBodySchema,
  WebFeedAnalysisSchema,
  WebFeedReanalysisSchema,
  WebFeedStatusSchema,
  type Category,
  type Counts,
  type Entry,
  type EntryPage,
  type Feed,
  type FeedSearchResult,
  type Preferences,
  type WebFeedAnalysis,
  type WebFeedReanalysis,
  type WebFeedStatus,
  type WebFeedVariant,
} from "shared/feedsApi/types";
import { sunPhase } from "shared/sun/sun";
import { TIMEZONE_COORDINATES } from "shared/sun/timezones.gen";
import { decodeCursor, encodeCursor } from "./cursor";
import {
  categoryIdsOf,
  toFeed,
  toLibrary,
  webFeedPageOf,
  type FolderPath,
  type Library,
  type Subscription,
} from "./library";
import {
  AddUrlAnswerSchema,
  FeedAutocompleteAnswerSchema,
  FeedsAnswerSchema,
  PreferencesAnswerSchema,
  RefreshFeedsAnswerSchema,
  SessionFieldsSchema,
  StoriesAnswerSchema,
  UserProfileAnswerSchema,
  WebFeedAnalyzeAnswerSchema,
  WebFeedStatusAnswerSchema,
  WriteAnswerSchema,
  type FeedsAnswer,
  type NewsblurFetch,
  type NewsblurRequest,
  type Params,
  type Story,
  type UpstreamWebFeedVariant,
  type WebFeedStatusAnswer,
  type WriteAnswer,
} from "./upstream";

interface BffConfig {
  newsletterAddress: string;
  // The NewsBlur user id stored at sign-in.
  userId: number;
  geo?: { lat: number; lon: number; timezone: string };
}

// The `/reader/feeds` answer, kept by the caller (the Durable Object, or memory in mock mode).
// `clear` bumps the generation, and `set` is ignored when the generation moved on since the `get`
// that preceded the fetch, so a read that started before a write can't cache the old tree.
export interface FeedsCache {
  get: () => Promise<{ value: unknown; generation: number }>;
  set: (input: { value: FeedsAnswer; generation: number }) => Promise<void>;
  clear: () => Promise<void>;
}

export interface BffResponse {
  status: number;
  body: unknown;
}

export interface HandleRequest {
  route: Route;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  upstream: NewsblurFetch;
  config: BffConfig;
  cache: FeedsCache;
}

interface Context {
  upstream: NewsblurFetch;
  config: BffConfig;
  cache: FeedsCache;
}

class BffError extends Error {
  constructor(readonly response: BffResponse) {
    super(`BFF answer ${response.status}`);
  }
}

const fail = ({ status, error, message }: { status: number; error: string; message?: string }) =>
  new BffError({ status, body: { error, message } });

const signInRequired = () => fail({ status: 401, error: "sign_in_required" });
const upstreamError = () => fail({ status: 502, error: "upstream_error" });
const notFound = () => fail({ status: 404, error: "not_found" });
const badRequest = (message: string) => fail({ status: 400, error: "bad_request", message });
const conflict = (message: string) => fail({ status: 409, error: "conflict", message });
const premiumRequired = (message: string) =>
  fail({ status: 403, error: "premium_required", message });

const ok = (body: unknown): BffResponse => ({ status: 200, body });
const created = (body: unknown): BffResponse => ({ status: 201, body });
const NO_CONTENT: BffResponse = { status: 204, body: null };

const LIRE_PREFIX = "lire.";
const REJECTED = "NewsBlur rejected the request.";
const ALREADY_EXISTS = "A category with this name already exists.";
// NewsBlur's own check on analysis ids.
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
// `/webfeed/subscribe` refuses an account without Premium Archive with code -1 on HTTP 200, so the
// message is the only signal.
const PREMIUM_REFUSAL = /premium archive/i;

const parseInput = <S extends z.ZodType>({ schema, value }: { schema: S; value: unknown }) => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw badRequest(z.prettifyError(parsed.error));
  return parsed.data;
};

// NewsBlur read views fall back to a demo user on a bad token and still answer 200, so every
// answer is checked against the user stored at sign-in.
const call = async <S extends z.ZodType>({
  ctx,
  request,
  schema,
}: {
  ctx: Context;
  request: NewsblurRequest;
  schema: S;
}): Promise<z.output<S>> => {
  let response: Response;
  try {
    response = await ctx.upstream(request);
  } catch {
    throw upstreamError();
  }
  if (response.status === 401 || response.status === 403) throw signInRequired();
  if (!response.ok) throw upstreamError();

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw upstreamError();
  }
  const session = SessionFieldsSchema.safeParse(json);
  if (
    session.success &&
    (session.data.authenticated === false ||
      (session.data.user_id !== undefined && session.data.user_id !== ctx.config.userId))
  ) {
    throw signInRequired();
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) throw upstreamError();
  return parsed.data;
};

const checkWrite = (answer: WriteAnswer): void => {
  const errors = answer.errors ?? [];
  if ((answer.code ?? 1) >= 1 && errors.length === 0) return;
  const reason = [answer.message, ...errors].filter(Boolean).join(" ");
  throw badRequest(reason.length > 0 ? reason : REJECTED);
};

const write = async ({ ctx, request }: { ctx: Context; request: NewsblurRequest }) => {
  checkWrite(await call({ ctx, request, schema: WriteAnswerSchema }));
};

const post = ({
  path,
  form,
}: {
  path: string;
  form: NewsblurRequest["form"];
}): NewsblurRequest => ({
  method: "POST",
  path,
  form,
});

// A write that changes feeds or folders drops the cached feed list, even when it fails halfway.
const mutate = async <T>({ ctx, run }: { ctx: Context; run: () => Promise<T> }): Promise<T> => {
  try {
    return await run();
  } finally {
    await ctx.cache.clear();
  }
};

const loadLibrary = async (ctx: Context): Promise<Library> => {
  const { value, generation } = await ctx.cache.get();
  const cached = FeedsAnswerSchema.safeParse(value);
  if (cached.success) return toLibrary(cached.data);
  const answer = await call({
    ctx,
    request: {
      method: "GET",
      path: "/reader/feeds",
      query: { flat: "false", include_favicons: "false", update_counts: "false" },
    },
    schema: FeedsAnswerSchema,
  });
  await ctx.cache.set({ value: answer, generation });
  return toLibrary(answer);
};

const findCategory = ({ library, id }: { library: Library; id: string }): Category => {
  const category = library.categories.find((candidate) => candidate.id === id);
  if (!category) throw notFound();
  return category;
};

const findSubscription = ({ library, id }: { library: Library; id: string }): Subscription => {
  const subscription = library.subscriptions.get(id);
  if (!subscription) throw notFound();
  return subscription;
};

// Preferences: values are JSON-encoded, so `set_preference` can't turn "true" into a boolean, and
// a deleted key holds the JSON string "null", because there is no delete call.
const decodePreference = (raw: unknown): string | undefined => {
  if (typeof raw !== "string") return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
};

const readPreferences = async (ctx: Context): Promise<Preferences> => {
  // The view reads `preference` from POST only, so a GET answers every key.
  const { payload } = await call({
    ctx,
    request: { method: "GET", path: "/profile/get_preference" },
    schema: PreferencesAnswerSchema,
  });
  const preferences: Preferences = {};
  for (const [key, raw] of Object.entries(payload)) {
    const value = key.startsWith(LIRE_PREFIX) ? decodePreference(raw) : undefined;
    if (value !== undefined) preferences[key] = value;
  }
  return preferences;
};

const CategoryOrderSchema = z.array(z.string());

const parseCategoryOrder = (raw: string | undefined): string[] => {
  if (raw === undefined) return [];
  try {
    const parsed = CategoryOrderSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

const renameInCategoryOrder = async ({
  ctx,
  from,
  to,
}: {
  ctx: Context;
  from: string;
  to: string;
}): Promise<void> => {
  const order = parseCategoryOrder((await readPreferences(ctx))[CATEGORY_ORDER_KEY]);
  const index = order.indexOf(from);
  if (index === -1 || from === to) return;
  const renamed = order.map((id) => (id === from ? to : id));
  await write({
    ctx,
    request: post({
      path: "/profile/set_preference",
      form: { [CATEGORY_ORDER_KEY]: JSON.stringify(JSON.stringify(renamed)) },
    }),
  });
};

const orderCategories = ({ categories, order }: { categories: Category[]; order: string[] }) => {
  const rank = (category: Category) => {
    const index = order.indexOf(category.id);
    return index === -1 ? order.length : index;
  };
  return [...categories].sort((a, b) => rank(a) - rank(b));
};

const leafOf = (path: FolderPath): string => path.at(-1) ?? "";

// Sends both the leaf names and the explicit paths: the paths make NewsBlur reject a stale folder
// instead of picking the first placement anywhere.
const moveFeed = async ({
  ctx,
  feedId,
  from,
  to,
}: {
  ctx: Context;
  feedId: string;
  from: FolderPath[];
  to: FolderPath[];
}) => {
  await write({
    ctx,
    request: post({
      path: "/reader/move_feed_to_folders",
      form: {
        feed_id: feedId,
        in_folders: from.map(leafOf),
        to_folders: to.map(leafOf),
        in_folder_paths: JSON.stringify(from),
        to_folder_paths: JSON.stringify(to),
      },
    }),
  });
};

const toEntry = (story: Story): Entry => ({
  id: story.story_hash,
  feedId: String(story.story_feed_id),
  title: story.story_title,
  author: story.story_authors === "" ? undefined : story.story_authors,
  content: story.story_content,
  published: story.story_timestamp * 1000,
  url: story.story_permalink ?? undefined,
  imageUrl: story.image_urls?.[0],
  unread: story.read_status === 0,
});

const pageOf = ({ token, q }: { token: string | undefined; q?: string }): number => {
  if (token === undefined) return 1;
  const cursor = decodeCursor(token);
  if (!cursor || cursor.q !== q) throw badRequest("Invalid cursor.");
  return cursor.page;
};

// NewsBlur sends no "more pages" flag, so a page shorter than the one asked for is the end.
// `undefined` means the size is unknown, and only an empty page ends the list.
const toPage = ({
  stories,
  page,
  q,
  pageSize,
}: {
  stories: Story[];
  page: number;
  q?: string;
  pageSize?: number;
}): EntryPage =>
  stories.length === 0 || (pageSize !== undefined && stories.length < pageSize)
    ? { items: stories.map(toEntry) }
    : { items: stories.map(toEntry), cursor: encodeCursor({ page: page + 1, q }) };

interface StoriesQuery {
  ctx: Context;
  stream: Stream;
  page: number;
  count: number | undefined;
  unreadOnly: boolean;
  order: "newest" | "oldest";
  q?: string;
}

// `count` maps to `limit` where the view reads it; a single feed has no `limit`, so the Worker
// chains upstream pages of 6 for a larger count.
const FEED_PAGE_SIZE = 6;
const RIVER_PAGE_SIZE = 12;

// The stories a full page holds. A read page and a search page come back uneven, so neither has one.
const pageSizeOf = ({ stream, count }: { stream: Stream; count: number | undefined }) => {
  if (stream.kind === "read") return undefined;
  if (stream.kind === "feed") {
    return count === undefined
      ? FEED_PAGE_SIZE
      : Math.ceil(count / FEED_PAGE_SIZE) * FEED_PAGE_SIZE;
  }
  return count ?? RIVER_PAGE_SIZE;
};

const fetchStories = async ({
  ctx,
  stream,
  page,
  count,
  unreadOnly,
  order,
  q,
}: StoriesQuery): Promise<Story[]> => {
  const common: Params = { page: String(page), order, ...(q === undefined ? {} : { query: q }) };
  const limit: Params = count === undefined ? {} : { limit: String(count) };
  const filters = { read_filter: unreadOnly ? "unread" : "all", include_hidden: "true" };

  let request: NewsblurRequest;
  if (stream.kind === "read") {
    request = { method: "GET", path: "/reader/read_stories", query: { ...common, ...limit } };
  } else if (stream.kind === "feed") {
    const chain = count === undefined ? 1 : Math.ceil(count / FEED_PAGE_SIZE);
    const answers = await Promise.all(
      Array.from({ length: chain }, async (_, index) =>
        call({
          ctx,
          request: {
            method: "GET",
            path: `/reader/feed/${stream.feedId}`,
            query: { ...common, page: String((page - 1) * chain + index + 1), ...filters },
          },
          schema: StoriesAnswerSchema,
        }),
      ),
    );
    return answers.flatMap(({ stories }) => stories);
  } else {
    const library = await loadLibrary(ctx);
    const feedIds =
      stream.kind === "all"
        ? library.feeds.map((feed) => feed.id)
        : findCategory({ library, id: stream.label }).feedIds;
    // `river_stories` with no feeds falls back to other parameters, never to every feed.
    if (feedIds.length === 0) return [];
    // A POST, because `all` with every feed id can overflow a GET URL.
    request = post({
      path: "/reader/river_stories",
      form: { ...common, ...limit, ...filters, feeds: feedIds },
    });
  }
  const { stories } = await call({ ctx, request, schema: StoriesAnswerSchema });
  return stories;
};

const text = (value: string | null | undefined): string | undefined => value ?? undefined;

const toVariant = (variant: UpstreamWebFeedVariant): WebFeedVariant => ({
  label: text(variant.label),
  description: text(variant.description),
  fields: {
    storyContainer: variant.story_container,
    title: variant.title,
    link: text(variant.link),
    content: text(variant.content),
    image: text(variant.image),
    author: text(variant.author),
    date: text(variant.date),
  },
  previews: (variant.preview_stories ?? []).map((preview) => ({
    title: text(preview.title),
    url: text(preview.link),
    summary: text(preview.content),
    imageUrl: text(preview.image),
  })),
});

// An id with no event yet stays pending: NewsBlur answers the same for a task the queue has not
// started and for one past its lifetime, and the client stops polling on its own deadline.
const toWebFeedStatus = (answer: WebFeedStatusAnswer): WebFeedStatus => {
  if (answer.type === "error")
    return { status: "failed", message: text(answer.error), variants: [] };
  if (answer.type !== "complete")
    return { status: "pending", message: text(answer.message), variants: [] };
  const results = answer.variants_data;
  if (!results) return { status: "failed", variants: [] };
  return {
    status: "done",
    variants: results.variants.map(toVariant),
    htmlHash: text(results.html_hash),
    pageTitle: text(results.page_title),
  };
};

interface HandlerInput {
  ctx: Context;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}

type Handler = (input: HandlerInput) => BffResponse | Promise<BffResponse>;

type KeyOf<R> = R extends { method: infer M extends string; path: infer P extends string }
  ? `${M} ${P}`
  : never;
type RouteKey = KeyOf<Route>;

const HANDLERS: Record<RouteKey, Handler> = {
  // The Worker answers this one itself when it has no session and the login fails; reaching the core means signed in.
  "GET /api/auth/status": () => ok({ signedIn: true }),

  "GET /api/profile": async ({ ctx }) => {
    const { user_profile } = await call({
      ctx,
      request: { method: "GET", path: "/social/load_user_profile" },
      schema: UserProfileAnswerSchema,
    });
    return ok({ username: user_profile.username });
  },

  "GET /api/categories": async ({ ctx }) => {
    const [library, preferences] = await Promise.all([loadLibrary(ctx), readPreferences(ctx)]);
    const order = parseCategoryOrder(preferences[CATEGORY_ORDER_KEY]);
    return ok(orderCategories({ categories: library.categories, order }));
  },

  "POST /api/categories": async ({ ctx, body }) => {
    const { label } = parseInput({ schema: CategoryBodySchema, value: body });
    if ((await loadLibrary(ctx)).categories.some((category) => category.id === label)) {
      throw conflict(ALREADY_EXISTS);
    }
    await mutate({
      ctx,
      run: async () => {
        await write({
          ctx,
          request: post({ path: "/reader/add_folder", form: { folder: label, parent_folder: "" } }),
        });
      },
    });
    return created({ id: label, label, feedIds: [] } satisfies Category);
  },

  "PATCH /api/categories/:categoryId": async ({ ctx, params, body }) => {
    const { label } = parseInput({ schema: CategoryBodySchema, value: body });
    const library = await loadLibrary(ctx);
    const category = findCategory({ library, id: params.categoryId });
    if (label !== category.id && library.categories.some((other) => other.id === label)) {
      throw conflict(ALREADY_EXISTS);
    }
    await mutate({
      ctx,
      run: async () => {
        await write({
          ctx,
          request: post({
            path: "/reader/rename_folder",
            form: { folder_to_rename: category.id, new_folder_name: label, in_folder: "" },
          }),
        });
        await renameInCategoryOrder({ ctx, from: category.id, to: label });
      },
    });
    return ok({ id: label, label, feedIds: category.feedIds } satisfies Category);
  },

  // NewsBlur's `delete_folder` drops the feeds inside from the tree, so each feed the user keeps
  // moves out first, and the folder goes only once every move succeeded.
  "DELETE /api/categories/:categoryId": async ({ ctx, params, query }) => {
    const { moveTo } = parseInput({ schema: DeleteCategoryQuerySchema, value: query });
    const library = await loadLibrary(ctx);
    const category = findCategory({ library, id: params.categoryId });
    if (
      moveTo !== undefined &&
      (moveTo === category.id || !library.categories.some((c) => c.id === moveTo))
    ) {
      throw badRequest("moveTo must name another category.");
    }
    await mutate({
      ctx,
      run: async () => {
        for (const { feed, placements } of library.subscriptions.values()) {
          const inside = placements.filter((path) => path[0] === category.id);
          if (inside.length === 0) continue;
          // Without `moveTo`, a feed that sits elsewhere too just loses this placement.
          const kept =
            moveTo === undefined
              ? placements.length > inside.length
              : placements.some((path) => path[0] === moveTo);
          const destination = moveTo === undefined ? [] : [moveTo];
          if (!kept) await moveFeed({ ctx, feedId: feed.id, from: inside, to: [destination] });
        }
        await write({
          ctx,
          request: post({
            path: "/reader/delete_folder",
            form: { folder_to_delete: category.id, in_folder: "" },
          }),
        });
      },
    });
    return NO_CONTENT;
  },

  "GET /api/feeds": async ({ ctx }) => ok((await loadLibrary(ctx)).feeds),

  "POST /api/feeds": async ({ ctx, body }) => {
    const input = parseInput({ schema: CreateFeedBodySchema, value: body });
    const categoryIds = [...new Set(input.categoryIds)];
    const feed = await mutate({
      ctx,
      run: async (): Promise<Feed> => {
        const answer = await call({
          ctx,
          request: post({
            path: "/reader/add_url",
            form: { url: input.feedUrl, folder: categoryIds[0] ?? "" },
          }),
          schema: AddUrlAnswerSchema,
        });
        checkWrite(answer);
        if (!answer.feed) throw upstreamError();
        const feedId = String(answer.feed.id);
        if (input.title !== undefined) {
          await write({
            ctx,
            request: post({
              path: "/reader/rename_feed",
              form: { feed_id: feedId, feed_title: input.title },
            }),
          });
        }
        const more = categoryIds.slice(1).map((id) => [id]);
        if (more.length > 0) await moveFeed({ ctx, feedId, from: [], to: more });
        const added = toFeed({ upstream: answer.feed, categoryIds });
        return { ...added, title: input.title ?? added.title };
      },
    });
    return created(feed);
  },

  // A new sender is a new feed NewsBlur made on its own, which the cached feed list can't know.
  "POST /api/feeds/refresh": async ({ ctx }) => {
    await ctx.cache.clear();
    return NO_CONTENT;
  },

  // Applying a new variant goes through `POST /api/webfeeds` with the `url` this answers.
  "POST /api/feeds/:feedId/reanalyze": async ({ ctx, params }) => {
    const { feed } = findSubscription({ library: await loadLibrary(ctx), id: params.feedId });
    if (!feed.isWebFeed || feed.feedUrl === undefined) throw badRequest("Not a web feed.");
    const answer = await call({
      ctx,
      request: post({ path: "/webfeed/reanalyze", form: { feed_id: feed.id } }),
      schema: WebFeedAnalyzeAnswerSchema,
    });
    checkWrite(answer);
    if (answer.request_id === undefined) throw upstreamError();
    return ok(
      WebFeedReanalysisSchema.parse({
        requestId: answer.request_id,
        url: webFeedPageOf(feed.feedUrl),
      } satisfies WebFeedReanalysis),
    );
  },

  "POST /api/webfeeds/analyze": async ({ ctx, body }) => {
    const { url } = parseInput({ schema: AnalyzeWebFeedBodySchema, value: body });
    const answer = await call({
      ctx,
      request: post({ path: "/webfeed/analyze", form: { url } }),
      schema: WebFeedAnalyzeAnswerSchema,
    });
    checkWrite(answer);
    if (answer.code === 2 && answer.feed_address !== undefined) {
      return ok(
        WebFeedAnalysisSchema.parse({ feedUrl: answer.feed_address } satisfies WebFeedAnalysis),
      );
    }
    if (answer.request_id === undefined) throw upstreamError();
    return ok(
      WebFeedAnalysisSchema.parse({ requestId: answer.request_id } satisfies WebFeedAnalysis),
    );
  },

  // No `checkWrite`: a task not started yet answers code -1.
  "GET /api/webfeeds/analyze/:requestId": async ({ ctx, params }) => {
    if (!REQUEST_ID.test(params.requestId)) throw notFound();
    const answer = await call({
      ctx,
      request: { method: "GET", path: "/webfeed/status", query: { request_id: params.requestId } },
      schema: WebFeedStatusAnswerSchema,
    });
    return ok(WebFeedStatusSchema.parse(toWebFeedStatus(answer)));
  },

  // NewsBlur keys a web feed on its page URL, so subscribing again to one already followed only
  // swaps its variant, and its title and categories stay as they are unless a title comes along.
  "POST /api/webfeeds": async ({ ctx, body }) => {
    const input = parseInput({ schema: CreateWebFeedBodySchema, value: body });
    const categoryIds = [...new Set(input.categoryIds)];
    const library = await loadLibrary(ctx);
    const { fields } = input;
    return mutate({
      ctx,
      run: async (): Promise<BffResponse> => {
        const answer = await call({
          ctx,
          request: post({
            path: "/webfeed/subscribe",
            form: {
              url: input.url,
              variant_index: String(input.variantIndex),
              folder: categoryIds[0] ?? "",
              feed_title: input.title ?? "",
              story_container_xpath: fields.storyContainer,
              title_xpath: fields.title,
              link_xpath: fields.link ?? "",
              content_xpath: fields.content ?? "",
              image_xpath: fields.image ?? "",
              author_xpath: fields.author ?? "",
              date_xpath: fields.date ?? "",
              html_hash: input.htmlHash ?? "",
            },
          }),
          schema: AddUrlAnswerSchema,
        });
        if ((answer.code ?? 1) < 1 && PREMIUM_REFUSAL.test(answer.message ?? "")) {
          throw premiumRequired(answer.message ?? "");
        }
        checkWrite(answer);
        if (!answer.feed) throw upstreamError();
        const feedId = String(answer.feed.id);
        if (input.title !== undefined) {
          await write({
            ctx,
            request: post({
              path: "/reader/rename_feed",
              form: { feed_id: feedId, feed_title: input.title },
            }),
          });
        }
        const existing = library.subscriptions.get(feedId);
        if (existing) return ok({ ...existing.feed, title: input.title ?? existing.feed.title });
        const more = categoryIds.slice(1).map((id) => [id]);
        if (more.length > 0) await moveFeed({ ctx, feedId, from: [], to: more });
        const added = toFeed({ upstream: answer.feed, categoryIds });
        return created({ ...added, title: input.title ?? added.title });
      },
    });
  },

  "PATCH /api/feeds/:feedId": async ({ ctx, params, body }) => {
    const input = parseInput({ schema: UpdateFeedBodySchema, value: body });
    const { feed, placements } = findSubscription({
      library: await loadLibrary(ctx),
      id: params.feedId,
    });
    const target = input.categoryIds === undefined ? undefined : [...new Set(input.categoryIds)];
    await mutate({
      ctx,
      run: async () => {
        if (input.title !== undefined) {
          await write({
            ctx,
            request: post({
              path: "/reader/rename_feed",
              form: { feed_id: feed.id, feed_title: input.title },
            }),
          });
        }
        if (target === undefined) return;
        // Keep a placement nested inside a category the feed stays in; no category means the top level.
        const keep = placements.filter((path) =>
          path.length === 0 ? target.length === 0 : target.includes(path[0]),
        );
        const from = placements.filter((path) => !keep.includes(path));
        const covered = categoryIdsOf(keep);
        const missing = target.filter((id) => !covered.includes(id)).map((id): FolderPath => [id]);
        const to = target.length === 0 && keep.length === 0 ? [[]] : missing;
        if (from.length > 0 || to.length > 0) await moveFeed({ ctx, feedId: feed.id, from, to });
      },
    });
    return ok({
      ...feed,
      title: input.title ?? feed.title,
      categoryIds: target ?? feed.categoryIds,
    } satisfies Feed);
  },

  // One `delete_feed` per placement, each naming its folder, so NewsBlur unsubscribes only when the
  // last one goes.
  "DELETE /api/feeds/:feedId": async ({ ctx, params }) => {
    const { feed, placements } = findSubscription({
      library: await loadLibrary(ctx),
      id: params.feedId,
    });
    await mutate({
      ctx,
      run: async () => {
        for (const path of placements) {
          await write({
            ctx,
            request: post({
              path: "/reader/delete_feed",
              form: {
                feed_id: feed.id,
                in_folder: leafOf(path),
                folder_path: JSON.stringify(path),
              },
            }),
          });
        }
      },
    });
    return NO_CONTENT;
  },

  // `ps + nt + ng`, because rivers send `include_hidden=true`. Only feeds in the tree count, as
  // orphaned subscriptions still report counts.
  "GET /api/counts": async ({ ctx }) => {
    const [library, refreshed] = await Promise.all([
      loadLibrary(ctx),
      call({
        ctx,
        request: { method: "GET", path: "/reader/refresh_feeds" },
        schema: RefreshFeedsAnswerSchema,
      }),
    ]);
    const feeds: Counts["feeds"] = {};
    let all = 0;
    for (const { id } of library.feeds) {
      const unread = Object.hasOwn(refreshed.feeds, id) ? refreshed.feeds[id] : undefined;
      feeds[id] = unread ? unread.ps + unread.nt + unread.ng : 0;
      all += feeds[id];
    }
    const categories: Counts["categories"] = {};
    for (const category of library.categories) {
      categories[category.id] = category.feedIds.reduce((sum, id) => sum + feeds[id], 0);
    }
    return ok({ all, feeds, categories } satisfies Counts);
  },

  "GET /api/streams/:streamKey/entries": async ({ ctx, params, query }) => {
    const stream = parseStreamKey(params.streamKey);
    if (!stream) throw notFound();
    const input = parseInput({ schema: StreamEntriesQuerySchema, value: query });
    const page = pageOf({ token: input.cursor });
    const stories = await fetchStories({
      ctx,
      stream,
      page,
      count: input.count,
      unreadOnly: input.unreadOnly ?? false,
      order: input.order ?? "newest",
    });
    return ok(toPage({ stories, page, pageSize: pageSizeOf({ stream, count: input.count }) }));
  },

  "GET /api/entries/:entryId": async ({ ctx, params }) => {
    const { stories } = await call({
      ctx,
      request: {
        method: "GET",
        path: "/reader/river_stories",
        query: { h: params.entryId, include_hidden: "true" },
      },
      schema: StoriesAnswerSchema,
    });
    const story = stories.find((candidate) => candidate.story_hash === params.entryId);
    if (!story) throw notFound();
    return ok(toEntry(story));
  },

  // Reads first, so an entry in both lists ends unread.
  "POST /api/entries/mark": async ({ ctx, body }) => {
    const { read = [], unread = [] } = parseInput({ schema: MarkBodySchema, value: body });
    if (read.length > 0) {
      await write({
        ctx,
        request: post({ path: "/reader/mark_story_hashes_as_read", form: { story_hash: read } }),
      });
    }
    for (const entryId of unread) {
      await write({
        ctx,
        request: post({ path: "/reader/mark_story_hash_as_unread", form: { story_hash: entryId } }),
      });
    }
    return NO_CONTENT;
  },

  "GET /api/search/entries": async ({ ctx, query }) => {
    const input = parseInput({ schema: SearchEntriesQuerySchema, value: query });
    const stream = parseStreamKey(input.streamKey);
    if (!stream) throw badRequest("Unknown streamKey.");
    const page = pageOf({ token: input.cursor, q: input.q });
    const stories = await fetchStories({
      ctx,
      stream,
      page,
      count: input.count,
      unreadOnly: input.unreadOnly ?? false,
      order: "newest",
      q: input.q,
    });
    return ok(toPage({ stories, page, q: input.q }));
  },

  "GET /api/search/feeds": async ({ ctx, query }) => {
    const { q } = parseInput({ schema: SearchFeedsQuerySchema, value: query });
    const { feeds } = await call({
      ctx,
      request: { method: "GET", path: "/rss_feeds/feed_autocomplete", query: { term: q, v: "2" } },
      schema: FeedAutocompleteAnswerSchema,
    });
    return ok(
      feeds.map((feed): FeedSearchResult => ({
        feedUrl: feed.value,
        title: feed.label,
        subscribers: feed.num_subscribers,
      })),
    );
  },

  "GET /api/preferences": async ({ ctx }) => ok(await readPreferences(ctx)),

  "POST /api/preferences": async ({ ctx, body }) => {
    const update = parseInput({ schema: PreferencesUpdateSchema, value: body });
    const keys = Object.keys(update);
    if (keys.some((key) => !key.startsWith(LIRE_PREFIX))) {
      throw badRequest(`Preference keys must start with "${LIRE_PREFIX}".`);
    }
    if (keys.length === 0) return NO_CONTENT;
    const form = Object.fromEntries(keys.map((key) => [key, JSON.stringify(update[key])]));
    await write({ ctx, request: post({ path: "/profile/set_preference", form }) });
    return NO_CONTENT;
  },

  "GET /api/newsletter-address": ({ ctx }) => {
    if (!ctx.config.newsletterAddress) throw notFound();
    return ok({ emailAddress: ctx.config.newsletterAddress });
  },

  "GET /api/sun": ({ ctx, query }) => {
    const { tz } = parseInput({ schema: SunQuerySchema, value: query });
    const { geo } = ctx.config;
    // hasOwn keeps a name like "constructor" from reaching the prototype.
    const position =
      geo?.timezone === tz
        ? geo
        : Object.hasOwn(TIMEZONE_COORDINATES, tz)
          ? TIMEZONE_COORDINATES[tz]
          : undefined;
    if (!position) throw notFound();
    const { phase, nextChangeAt } = sunPhase({
      at: new Date(),
      lat: position.lat,
      lon: position.lon,
    });
    return ok(SunPhaseSchema.parse({ phase, nextChangeAt: nextChangeAt.toISOString() }));
  },
};

// Upstream 401 and 403 answer `sign_in_required`, other upstream failures 502, and a NewsBlur
// write that reports a failure 400 with its message, even on HTTP 200. A web feed subscribe
// refused for want of Premium Archive answers 403 `premium_required`.
export const handle = async ({
  route,
  params,
  query,
  body,
  upstream,
  config,
  cache,
}: HandleRequest): Promise<BffResponse> => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every Route builds a RouteKey
  const handler = HANDLERS[`${route.method} ${route.path}` as RouteKey];
  try {
    return await handler({
      ctx: { upstream, config, cache },
      params,
      query: Object.fromEntries(query),
      body,
    });
  } catch (error) {
    if (error instanceof BffError) return error.response;
    throw error;
  }
};
