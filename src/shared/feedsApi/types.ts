import { z } from "zod";

// Feeds API shapes. Zod schemas cover response bodies the client actually parses
// (Collection, Subscription, MarkerCounts, StreamContents, Entry, FeedSearchResponse) and stay
// `.loose()` all the way down so a field the API adds later doesn't get silently dropped.

export const ProfileSchema = z
  .object({
    id: z.string(),
    email: z.string().optional(),
    fullName: z.string().optional(),
    picture: z.string().optional(),
  })
  .loose();
export type Profile = z.infer<typeof ProfileSchema>;

const CategorySchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
  })
  .loose();

const FeedSchema = z
  .object({
    id: z.string(),
    // Present on collections[].feeds and search results, absent on subscription-list items.
    feedId: z.string().optional(),
    title: z.string(),
    website: z.string().optional(),
    iconUrl: z.string().optional(),
    visualUrl: z.string().optional(),
    subscribers: z.number().optional(),
    updated: z.number().optional(),
    velocity: z.number().optional(),
    topics: z.array(z.string()).optional(),
    state: z.string().optional(),
  })
  .loose();
export type Feed = z.infer<typeof FeedSchema>;

export const CollectionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
    cover: z.string().optional(),
    // Older categories with a slug id (…/category/<slug>) carry no `created`.
    created: z.number().optional(),
    feeds: z.array(FeedSchema),
  })
  .loose();
export type Collection = z.infer<typeof CollectionSchema>;

export const SubscriptionSchema = FeedSchema.extend({
  categories: z.array(CategorySchema),
}).loose();
export type Subscription = z.infer<typeof SubscriptionSchema>;

const UnreadCountSchema = z
  .object({
    id: z.string(),
    count: z.number(),
    updated: z.number(),
  })
  .loose();

export const MarkerCountsSchema = z
  .object({
    unreadcounts: z.array(UnreadCountSchema),
    updated: z.number(),
  })
  .loose();
export type MarkerCounts = z.infer<typeof MarkerCountsSchema>;

// Email newsletters (origin feed/…/email/…) come without `direction` and
// without `published`; every other entry has both.
const EntryContentSchema = z
  .object({
    content: z.string(),
    direction: z.string().optional(),
  })
  .loose();

const EntryOriginSchema = z
  .object({
    streamId: z.string(),
    title: z.string().optional(),
    htmlUrl: z.string().optional(),
  })
  .loose();

const EntryLinkSchema = z
  .object({
    href: z.string(),
    type: z.string().optional(),
  })
  .loose();

const EntryVisualSchema = z
  .object({
    url: z.string(),
    edgeCacheUrl: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    contentType: z.string().optional(),
    processor: z.string().optional(),
  })
  .loose();

export const EntrySchema = z
  .object({
    id: z.string(),
    // Absent on some bridged feeds (e.g. Twitter mirrors).
    originId: z.string().optional(),
    fingerprint: z.string(),
    title: z.string().optional(),
    author: z.string().optional(),
    published: z.number().optional(),
    crawled: z.number(),
    updated: z.number().optional(),
    actionTimestamp: z.number().optional(),
    unread: z.boolean(),
    keywords: z.array(z.string()).optional(),
    summary: EntryContentSchema.optional(),
    content: EntryContentSchema.optional(),
    fullContent: z.string().optional(),
    origin: EntryOriginSchema,
    alternate: z.array(EntryLinkSchema).optional(),
    canonical: z.array(EntryLinkSchema).optional(),
    canonicalUrl: z.string().optional(),
    visual: EntryVisualSchema.optional(),
    tags: z.array(CategorySchema).optional(),
    categories: z.array(CategorySchema).optional(),
    engagement: z.number().optional(),
    engagementRate: z.number().optional(),
  })
  .loose();
export type Entry = z.infer<typeof EntrySchema>;

export const StreamContentsSchema = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    direction: z.string().optional(),
    updated: z.number().optional(),
    continuation: z.string().optional(),
    items: z.array(EntrySchema),
  })
  .loose();
export type StreamContents = z.infer<typeof StreamContentsSchema>;

const FeedSearchResultSchema = z
  .object({
    feedId: z.string(),
    title: z.string(),
    website: z.string().optional(),
    iconUrl: z.string().optional(),
    visualUrl: z.string().optional(),
    subscribers: z.number().optional(),
    description: z.string().optional(),
    language: z.string().optional(),
  })
  .loose();

export const FeedSearchResponseSchema = z
  .object({
    results: z.array(FeedSearchResultSchema),
    hint: z.string().optional(),
    related: z.array(z.string()).optional(),
  })
  .loose();
export type FeedSearchResponse = z.infer<typeof FeedSearchResponseSchema>;

export const NewsletterAddressSchema = z
  .object({ emailAddress: z.string(), feedId: z.string() })
  .loose();
export type NewsletterAddress = z.infer<typeof NewsletterAddressSchema>;

// The account-wide key/value bucket behind the preferences endpoint. Other clients store
// strings, arrays and objects in there; lire only ever writes strings.
export const PreferencesSchema = z.record(z.string(), z.unknown());
export type Preferences = z.infer<typeof PreferencesSchema>;

// Request body for the markers POST. keepUnread only ever targets entries; "mark all read" is
// markAsRead on feeds/categories — the feeds API answers 400 "unknown action parameter" to
// `markAllRead`.
interface MarkerActionCommon {
  asOf?: number;
}

export type MarkerAction =
  | ({ action: "markAsRead"; type: "entries"; entryIds: string[] } & MarkerActionCommon)
  | ({ action: "markAsRead"; type: "feeds"; feedIds: string[] } & MarkerActionCommon)
  | ({ action: "markAsRead"; type: "categories"; categoryIds: string[] } & MarkerActionCommon)
  | ({ action: "keepUnread"; type: "entries"; entryIds: string[] } & MarkerActionCommon);

// From the X-Ratelimit-* response headers. Only consumed by scripts/record-fixtures.ts.
/** @public */
export interface RateLimit {
  count: number;
  limit: number;
  reset: number;
}
