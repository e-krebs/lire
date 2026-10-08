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
    // Only on a newsletter whose sender address is known, not one named by a list id.
    senderEmail: z.string().optional(),
    // Present, and true, only on a web feed.
    isWebFeed: z.boolean().optional(),
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

// One variant of a web feed analysis. `fields` holds NewsBlur's XPath expressions, which the
// client sends back untouched to subscribe. A preview is plain text taken from the page.
const WebFeedFieldsSchema = z
  .object({
    storyContainer: z.string(),
    title: z.string(),
    link: z.string().optional(),
    content: z.string().optional(),
    image: z.string().optional(),
    author: z.string().optional(),
    date: z.string().optional(),
  })
  .loose();

const WebFeedVariantSchema = z
  .object({
    label: z.string().optional(),
    description: z.string().optional(),
    fields: WebFeedFieldsSchema,
    previews: z.array(
      z
        .object({
          title: z.string().optional(),
          url: z.string().optional(),
          summary: z.string().optional(),
          imageUrl: z.string().optional(),
        })
        .loose(),
    ),
  })
  .loose();
export type WebFeedVariant = z.infer<typeof WebFeedVariantSchema>;

// `requestId` to poll, or `feedUrl` alone when the URL is already a feed.
export const WebFeedAnalysisSchema = z
  .object({ requestId: z.string().optional(), feedUrl: z.string().optional() })
  .loose();
export type WebFeedAnalysis = z.infer<typeof WebFeedAnalysisSchema>;

// `variants` is empty until `done`.
export const WebFeedStatusSchema = z
  .object({
    status: z.enum(["pending", "done", "failed"]),
    message: z.string().optional(),
    variants: z.array(WebFeedVariantSchema),
    htmlHash: z.string().optional(),
    pageTitle: z.string().optional(),
  })
  .loose();
export type WebFeedStatus = z.infer<typeof WebFeedStatusSchema>;

// `url` is the page the feed reads, to send back to `POST /api/webfeeds` with the picked variant.
export const WebFeedReanalysisSchema = z.object({ requestId: z.string(), url: z.string() }).loose();
export type WebFeedReanalysis = z.infer<typeof WebFeedReanalysisSchema>;

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
export const MarkBodySchema = z
  .object({ read: z.array(z.string()).optional(), unread: z.array(z.string()).optional() })
  .loose()
  .refine(({ read = [], unread = [] }) => read.length + unread.length > 0, {
    message: "read or unread must hold at least one id.",
  });

export const CreateFeedBodySchema = z
  .object({
    feedUrl: z.string(),
    title: z.string().optional(),
    categoryIds: z.array(z.string()),
  })
  .loose();

export const AnalyzeWebFeedBodySchema = z.object({ url: z.string().min(1) }).loose();

export const CreateWebFeedBodySchema = z
  .object({
    url: z.string().min(1),
    variantIndex: z.number().int().nonnegative(),
    fields: WebFeedFieldsSchema,
    htmlHash: z.string().optional(),
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
