import type { StreamKey } from "shared/feedsApi/streamKey";
import {
  AuthStatusSchema,
  CategoriesSchema,
  CountsSchema,
  EntryPageSchema,
  EntrySchema,
  FeedSearchResultsSchema,
  FeedsSchema,
  NewsletterAddressSchema,
  PreferencesSchema,
  ProfileSchema,
  SunPhaseSchema,
} from "shared/feedsApi/types";
import type {
  AuthStatus,
  Category,
  Counts,
  Entry,
  EntryPage,
  Feed,
  FeedSearchResult,
  NewsletterAddress,
  Preferences,
  PreferencesUpdate,
  Profile,
  SunPhase,
} from "shared/feedsApi/types";
import { httpTransport } from "client/api/adapters/http";
import type { Transport, TransportRequest, TransportResponse } from "client/api/transport";

type ApiErrorCode = "sign_in_required" | "rate_limited" | "http";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor({ status, code, message }: { status: number; code: ApiErrorCode; message?: string }) {
    super(message ?? `API error (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// Mock mode is the default: only an explicit "real" targets the Worker.
export const isMockMode = (): boolean => import.meta.env.VITE_API_MODE !== "real";

const importFixtureTransport = async (): Promise<Transport> =>
  import("client/api/adapters/fixture").then((m) => m.fixtureTransport);

// The literal env compares, not isMockMode(), let the bundler drop the fixture chunk from a real
// build. Mock mode starts the import at module load, so the chunk loads beside the app, not after
// the first query.
let fixtureTransport: Promise<Transport> | undefined =
  import.meta.env.VITE_API_MODE === "real" ? undefined : importFixtureTransport();

const loadTransport = async (): Promise<Transport> => {
  if (import.meta.env.VITE_API_MODE === "real") return httpTransport;
  fixtureTransport ??= importFixtureTransport();
  return fixtureTransport;
};

const performRequest = async (req: TransportRequest): Promise<TransportResponse> => {
  const transport = await loadTransport();
  const response = await transport(req);

  if (response.status === 401) throw new ApiError({ status: 401, code: "sign_in_required" });
  if (response.status === 429) throw new ApiError({ status: 429, code: "rate_limited" });
  if (response.status >= 400) throw new ApiError({ status: response.status, code: "http" });

  return response;
};

const request = async (req: TransportRequest): Promise<unknown> => {
  const response = await performRequest(req);
  return response.json();
};

// Skips response.json(): writes answer 204 with no body.
const requestVoid = async (req: TransportRequest): Promise<void> => {
  await performRequest(req);
};

const segment = (value: string): string => encodeURIComponent(value);

export const getProfile = async (): Promise<Profile> =>
  ProfileSchema.parse(await request({ method: "GET", path: "/api/profile" }));

// Ordered by the `lire.categoryOrder` preference.
export const getCategories = async (): Promise<Category[]> =>
  CategoriesSchema.parse(await request({ method: "GET", path: "/api/categories" }));

export const getFeeds = async (): Promise<Feed[]> =>
  FeedsSchema.parse(await request({ method: "GET", path: "/api/feeds" }));

export const getCounts = async (): Promise<Counts> =>
  CountsSchema.parse(await request({ method: "GET", path: "/api/counts" }));

export type EntryOrder = "newest" | "oldest";

export const getStreamEntries = async ({
  streamKey,
  count,
  unreadOnly,
  order,
  cursor,
}: {
  streamKey: StreamKey;
  count?: number;
  unreadOnly?: boolean;
  order?: EntryOrder;
  cursor?: string;
}): Promise<EntryPage> => {
  const json = await request({
    method: "GET",
    path: `/api/streams/${segment(streamKey)}/entries`,
    query: { count, unreadOnly, order, cursor },
  });
  return EntryPageSchema.parse(json);
};

export const getEntry = async (entryId: string): Promise<Entry> =>
  EntrySchema.parse(await request({ method: "GET", path: `/api/entries/${segment(entryId)}` }));

export const searchEntries = async ({
  streamKey,
  query,
  count,
  unreadOnly,
  cursor,
}: {
  streamKey: StreamKey;
  query: string;
  count?: number;
  unreadOnly?: boolean;
  cursor?: string;
}): Promise<EntryPage> => {
  const json = await request({
    method: "GET",
    path: "/api/search/entries",
    query: { streamKey, q: query, count, unreadOnly, cursor },
  });
  return EntryPageSchema.parse(json);
};

export const searchFeeds = async (query: string): Promise<FeedSearchResult[]> =>
  FeedSearchResultsSchema.parse(
    await request({ method: "GET", path: "/api/search/feeds", query: { q: query } }),
  );

export const markRead = async ({
  entryIds,
  keepalive,
}: {
  entryIds: string[];
  keepalive?: boolean;
}): Promise<void> => {
  await requestVoid({ method: "POST", path: "/api/entries/read", body: { entryIds }, keepalive });
};

export const markUnread = async ({ entryIds }: { entryIds: string[] }): Promise<void> => {
  await requestVoid({ method: "POST", path: "/api/entries/unread", body: { entryIds } });
};

export const createFeed = async ({
  feedUrl,
  title,
  categoryIds,
}: {
  feedUrl: string;
  title?: string;
  categoryIds: string[];
}): Promise<Feed> => {
  const json = await request({
    method: "POST",
    path: "/api/feeds",
    body: { feedUrl, title, categoryIds },
  });
  return FeedsSchema.element.parse(json);
};

export const updateFeed = async ({
  feedId,
  title,
  categoryIds,
}: {
  feedId: string;
  title?: string;
  categoryIds?: string[];
}): Promise<Feed> => {
  const json = await request({
    method: "PATCH",
    path: `/api/feeds/${segment(feedId)}`,
    body: { title, categoryIds },
  });
  return FeedsSchema.element.parse(json);
};

export const deleteFeed = async (feedId: string): Promise<void> => {
  await requestVoid({ method: "DELETE", path: `/api/feeds/${segment(feedId)}` });
};

export const createCategory = async (label: string): Promise<Category> =>
  CategoriesSchema.element.parse(
    await request({ method: "POST", path: "/api/categories", body: { label } }),
  );

export const renameCategory = async ({
  categoryId,
  label,
}: {
  categoryId: string;
  label: string;
}): Promise<Category> =>
  CategoriesSchema.element.parse(
    await request({
      method: "PATCH",
      path: `/api/categories/${segment(categoryId)}`,
      body: { label },
    }),
  );

// Without `moveTo`, a feed only in this category lands at the top level; with it, every feed in
// the category moves there first.
export const deleteCategory = async ({
  categoryId,
  moveTo,
}: {
  categoryId: string;
  moveTo?: string;
}): Promise<void> => {
  await requestVoid({
    method: "DELETE",
    path: `/api/categories/${segment(categoryId)}`,
    query: { moveTo },
  });
};

export const getPreferences = async (): Promise<Preferences> =>
  PreferencesSchema.parse(await request({ method: "GET", path: "/api/preferences" }));

// A partial record merges in; a `null` value deletes the key.
export const updatePreferences = async (patch: PreferencesUpdate): Promise<void> => {
  await requestVoid({ method: "POST", path: "/api/preferences", body: patch });
};

export const getNewsletterAddress = async (): Promise<NewsletterAddress> =>
  NewsletterAddressSchema.parse(await request({ method: "GET", path: "/api/newsletter-address" }));

// Unknown zones answer 404 (null, as a query cannot resolve undefined): no phase, so the caller falls back to the colour scheme.
export const getSunPhase = async ({ tz }: { tz: string }): Promise<SunPhase | null> => {
  try {
    return SunPhaseSchema.parse(await request({ method: "GET", path: "/api/sun", query: { tz } }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};

export const getAuthStatus = async (): Promise<AuthStatus> => {
  if (isMockMode()) return { signedIn: true };
  const response = await httpTransport({ method: "GET", path: "/api/auth/status" });
  if (response.status !== 200) return { signedIn: false };
  return AuthStatusSchema.parse(await response.json());
};
