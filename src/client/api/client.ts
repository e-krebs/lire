import { z } from "zod";
import {
  CollectionSchema,
  SubscriptionSchema,
  ProfileSchema,
  MarkerCountsSchema,
  StreamContentsSchema,
  EntrySchema,
  FeedSearchResponseSchema,
  PreferencesSchema,
  NewsletterAddressSchema,
} from "shared/feedsApi/types";
import type {
  Profile,
  Collection,
  Subscription,
  MarkerCounts,
  StreamContents,
  Entry,
  FeedSearchResponse,
  MarkerAction,
  Preferences,
  NewsletterAddress,
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

// Skips response.json() entirely: markers/subscriptions endpoints may answer with an empty body.
const requestVoid = async (req: TransportRequest): Promise<void> => {
  await performRequest(req);
};

export const getProfile = async (): Promise<Profile> => {
  const json = await request({ method: "GET", path: "/v3/profile" });
  return ProfileSchema.parse(json);
};

export const getCollections = async (): Promise<Collection[]> => {
  const json = await request({ method: "GET", path: "/v3/collections" });
  return z.array(CollectionSchema).parse(json);
};

export const getSubscriptions = async (): Promise<Subscription[]> => {
  const json = await request({ method: "GET", path: "/v3/subscriptions" });
  return z.array(SubscriptionSchema).parse(json);
};

export const getUnreadCounts = async (): Promise<MarkerCounts> => {
  const json = await request({ method: "GET", path: "/v3/markers/counts" });
  return MarkerCountsSchema.parse(json);
};

export const getStream = async ({
  streamId,
  count,
  unreadOnly,
  ranked,
  continuation,
}: {
  streamId: string;
  count?: number;
  unreadOnly?: boolean;
  ranked?: "newest" | "oldest";
  continuation?: string;
}): Promise<StreamContents> => {
  const json = await request({
    method: "GET",
    path: "/v3/streams/contents",
    query: { streamId, count, unreadOnly, ranked, continuation },
  });
  return StreamContentsSchema.parse(json);
};

export const getEntry = async (entryId: string): Promise<Entry> => {
  const json = await request({ method: "GET", path: `/v3/entries/${encodeURIComponent(entryId)}` });
  // The feeds API answers with a one-element array.
  const entry = z.array(EntrySchema).parse(json).at(0);
  if (!entry) throw new ApiError({ status: 404, code: "http", message: "Entry not found" });
  return entry;
};

export const markEntries = async ({
  entryIds,
  read,
}: {
  entryIds: string[];
  read: boolean;
}): Promise<void> => {
  const body: MarkerAction = read
    ? { action: "markAsRead", type: "entries", entryIds }
    : { action: "keepUnread", type: "entries", entryIds };
  await requestVoid({ method: "POST", path: "/v3/markers", body });
};

// Paid plan only: a free account answers 4xx here, which surfaces as an ApiError like any other.
export const searchContents = async ({
  streamId,
  query,
  count,
  unreadOnly,
  continuation,
}: {
  streamId: string;
  query: string;
  count?: number;
  unreadOnly?: boolean;
  continuation?: string;
}): Promise<StreamContents> => {
  const json = await request({
    method: "GET",
    path: "/v3/search/contents",
    query: { streamId, query, count, unreadOnly, continuation },
  });
  return StreamContentsSchema.parse(json);
};

export const searchFeeds = async (query: string): Promise<FeedSearchResponse> => {
  const json = await request({ method: "GET", path: "/v3/search/feeds", query: { query } });
  return FeedSearchResponseSchema.parse(json);
};

export const postSubscription = async ({
  feedId,
  title,
  categoryIds,
}: {
  feedId: string;
  title?: string;
  categoryIds: string[];
}): Promise<void> => {
  await requestVoid({
    method: "POST",
    path: "/v3/subscriptions",
    body: { id: feedId, title, categories: categoryIds.map((id) => ({ id })) },
  });
};

export const subscribe = async ({
  feedId,
  title,
  categoryIds,
}: {
  feedId: string;
  title: string;
  categoryIds: string[];
}): Promise<void> => postSubscription({ feedId, title, categoryIds });

// The `{}` body is load-bearing: the Worker rejects a POST without a JSON content type.
export const createNewsletterAddress = async (): Promise<NewsletterAddress> => {
  const json = await request({ method: "POST", path: "/v3/feeds/newsletters", body: {} });
  return NewsletterAddressSchema.parse(json);
};

export const addFeedToCollection = async ({
  collectionId,
  feedId,
  title,
}: {
  collectionId: string;
  feedId: string;
  title: string;
}): Promise<void> => {
  await requestVoid({
    method: "POST",
    path: `/v3/collections/${encodeURIComponent(collectionId)}/feeds/.mput`,
    body: [{ id: feedId, title }],
  });
};

export const unsubscribe = async (feedId: string): Promise<void> => {
  await requestVoid({ method: "DELETE", path: `/v3/subscriptions/${encodeURIComponent(feedId)}` });
};

// The feeds API answers a collection create/rename with a one-element array, like
// `/v3/entries/:id`.
const postCollection = async ({
  id,
  label,
}: {
  id?: string;
  label: string;
}): Promise<Collection> => {
  const json = await request({ method: "POST", path: "/v3/collections", body: { id, label } });
  const collection = z.array(CollectionSchema).parse(json).at(0);
  if (!collection)
    throw new ApiError({ status: 404, code: "http", message: "Collection not found" });
  return collection;
};

export const renameCollection = async ({
  id,
  label,
}: {
  id: string;
  label: string;
}): Promise<Collection> => postCollection({ id, label });

export const createCollection = async (label: string): Promise<Collection> =>
  postCollection({ label });

export const deleteCollection = async (id: string): Promise<void> => {
  await requestVoid({ method: "DELETE", path: `/v3/collections/${encodeURIComponent(id)}` });
};

// The feeds API's own sentinel: a key set to it is removed from the bucket. A `null` value gets
// a 400.
export const PREFERENCE_DELETE = "==DELETE==";

export const getPreferences = async (): Promise<Preferences> => {
  const json = await request({ method: "GET", path: "/v3/preferences" });
  return PreferencesSchema.parse(json);
};

// A partial body merges into the bucket; the answer is the whole merged store.
export const updatePreferences = async (patch: Record<string, string>): Promise<Preferences> => {
  const json = await request({ method: "POST", path: "/v3/preferences", body: patch });
  return PreferencesSchema.parse(json);
};

const AuthStatusSchema = z.object({ signedIn: z.boolean() });

export const getAuthStatus = async (): Promise<{ signedIn: boolean }> => {
  if (isMockMode()) return { signedIn: true };
  const response = await httpTransport({ method: "GET", path: "/auth/status" });
  if (response.status !== 200) return { signedIn: false };
  return AuthStatusSchema.parse(await response.json());
};
