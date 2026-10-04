import { z } from "zod";

// Lire API shapes, shared by the client and the Worker. Objects stay `.loose()` all the way down
// so a field the Worker adds later doesn't get silently dropped by an older client.

export const AuthStatusSchema = z.object({ signedIn: z.boolean() }).loose();
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

export const ProfileSchema = z
  .object({
    username: z.string(),
    email: z.string().optional(),
  })
  .loose();
export type Profile = z.infer<typeof ProfileSchema>;

// A category is a top-level folder; its id is the folder title.
const CategorySchema = z
  .object({
    id: z.string(),
    label: z.string(),
    feedIds: z.array(z.string()),
  })
  .loose();
export type Category = z.infer<typeof CategorySchema>;

export const CategoriesSchema = z.array(CategorySchema);

const FeedSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    siteUrl: z.string().optional(),
    feedUrl: z.string().optional(),
    iconUrl: z.string().optional(),
    categoryIds: z.array(z.string()),
    isNewsletter: z.boolean(),
  })
  .loose();
export type Feed = z.infer<typeof FeedSchema>;

export const FeedsSchema = z.array(FeedSchema);

export const CountsSchema = z
  .object({
    all: z.number(),
    feeds: z.record(z.string(), z.number()),
    categories: z.record(z.string(), z.number()),
  })
  .loose();
export type Counts = z.infer<typeof CountsSchema>;

// `summary` and `content` are HTML. `published` is epoch milliseconds.
export const EntrySchema = z
  .object({
    id: z.string(),
    feedId: z.string(),
    title: z.string().optional(),
    author: z.string().optional(),
    summary: z.string().optional(),
    content: z.string().optional(),
    published: z.number(),
    url: z.string().optional(),
    imageUrl: z.string().optional(),
    unread: z.boolean(),
  })
  .loose();
export type Entry = z.infer<typeof EntrySchema>;

export const EntryPageSchema = z
  .object({
    items: z.array(EntrySchema),
    cursor: z.string().optional(),
  })
  .loose();
export type EntryPage = z.infer<typeof EntryPageSchema>;

const FeedSearchResultSchema = z
  .object({
    feedUrl: z.string(),
    title: z.string(),
    subscribers: z.number().optional(),
  })
  .loose();
export type FeedSearchResult = z.infer<typeof FeedSearchResultSchema>;

export const FeedSearchResultsSchema = z.array(FeedSearchResultSchema);

export const NewsletterAddressSchema = z.object({ emailAddress: z.string() }).loose();
export type NewsletterAddress = z.infer<typeof NewsletterAddressSchema>;

export const SunPhaseSchema = z
  .object({ phase: z.enum(["day", "dusk"]), nextChangeAt: z.iso.datetime() })
  .loose();
export type SunPhase = z.infer<typeof SunPhaseSchema>;

export const PreferencesSchema = z.record(z.string(), z.string());
export type Preferences = z.infer<typeof PreferencesSchema>;

// `null` deletes the key.
export const PreferencesUpdateSchema = z.record(z.string(), z.string().nullable());
export type PreferencesUpdate = z.infer<typeof PreferencesUpdateSchema>;

// Query strings. Every field is optional; the Worker picks the defaults.
const countParam = z.coerce.number().int().positive().max(50).optional();
const unreadOnlyParam = z.stringbool().optional();

export const StreamEntriesQuerySchema = z
  .object({
    count: countParam,
    unreadOnly: unreadOnlyParam,
    order: z.enum(["newest", "oldest"]).optional(),
    cursor: z.string().optional(),
  })
  .loose();

export const SearchEntriesQuerySchema = z
  .object({
    streamKey: z.string(),
    q: z.string().min(1),
    count: countParam,
    unreadOnly: unreadOnlyParam,
    cursor: z.string().optional(),
  })
  .loose();

export const SearchFeedsQuerySchema = z.object({ q: z.string().min(1) }).loose();

export const SunQuerySchema = z
  .object({
    tz: z
      .string()
      .max(64)
      .regex(/^[A-Za-z0-9_+\-/]+$/),
  })
  .loose();

export const DeleteCategoryQuerySchema = z.object({ moveTo: z.string().optional() }).loose();

// Request bodies.
export const MarkEntriesBodySchema = z.object({ entryIds: z.array(z.string()).min(1) }).loose();

export const CreateFeedBodySchema = z
  .object({
    feedUrl: z.string(),
    title: z.string().optional(),
    categoryIds: z.array(z.string()),
  })
  .loose();

export const UpdateFeedBodySchema = z
  .object({
    title: z.string().optional(),
    categoryIds: z.array(z.string()).optional(),
  })
  .loose();

export const CategoryBodySchema = z.object({ label: z.string().min(1) }).loose();
