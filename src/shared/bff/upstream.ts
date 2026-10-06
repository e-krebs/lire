import { z } from "zod";

// The NewsBlur calls the BFF makes and the slices of their answers it reads. Schemas strip unknown
// keys, so a cached feed list holds only what the BFF uses.

// Feed icons come back relative to the NewsBlur host unless they sit on S3.
export const NEWSBLUR_ORIGIN = "https://newsblur.com";

export type Params = Record<string, string | readonly string[]>;

export interface NewsblurRequest {
  method: "GET" | "POST";
  path: string;
  query?: Params;
  // Sent form-encoded, an array as repeated keys.
  form?: Params;
}

export type NewsblurFetch = (request: NewsblurRequest) => Promise<Response>;

export const encodeParams = (params: Params): URLSearchParams => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") search.append(key, value);
    else for (const item of value) search.append(key, item);
  }
  return search;
};

// A folder tree item: a feed id, or `{title: children}`.
export type FolderItem = number | { [title: string]: FolderItem[] };

const FolderItemSchema: z.ZodType<FolderItem> = z.lazy(() =>
  z.union([z.number(), z.record(z.string(), z.array(FolderItemSchema))]),
);

const UpstreamFeedSchema = z.object({
  id: z.number(),
  feed_title: z.string(),
  feed_address: z.string(),
  feed_link: z.string().nullish(),
  favicon_url: z.string().nullish(),
  is_webfeed: z.boolean().optional(),
});
export type UpstreamFeed = z.infer<typeof UpstreamFeedSchema>;

// `/reader/feeds?flat=false`. An account with no folder object answers `feeds: []`.
export const FeedsAnswerSchema = z.object({
  feeds: z.union([
    z.record(z.string(), UpstreamFeedSchema),
    z
      .array(UpstreamFeedSchema)
      .transform((feeds) => Object.fromEntries(feeds.map((feed) => [String(feed.id), feed]))),
  ]),
  folders: z.array(FolderItemSchema),
});
export type FeedsAnswer = z.infer<typeof FeedsAnswerSchema>;

// `/reader/refresh_feeds`: positive, neutral and negative unread counts per feed id.
export const RefreshFeedsAnswerSchema = z.object({
  feeds: z.record(z.string(), z.object({ ps: z.number(), nt: z.number(), ng: z.number() })),
});

const StorySchema = z.object({
  story_hash: z.string(),
  story_feed_id: z.number(),
  story_title: z.string().optional(),
  story_authors: z.string().optional(),
  story_content: z.string().optional(),
  story_permalink: z.string().nullish(),
  // Epoch seconds, sent as a string.
  story_timestamp: z.coerce.number(),
  image_urls: z.array(z.string()).optional(),
  read_status: z.number().optional(),
});
export type Story = z.infer<typeof StorySchema>;

// `/reader/feed/:id`, `/reader/river_stories` and `/reader/read_stories`.
export const StoriesAnswerSchema = z.object({ stories: z.array(StorySchema) });

// `/rss_feeds/feed_autocomplete?v=2`.
export const FeedAutocompleteAnswerSchema = z.object({
  feeds: z.array(
    z.object({ value: z.string(), label: z.string(), num_subscribers: z.number().optional() }),
  ),
});

// `/profile/get_preference` with no name: the whole preference blob.
export const PreferencesAnswerSchema = z.object({ payload: z.record(z.string(), z.unknown()) });

export const UserProfileAnswerSchema = z.object({
  user_profile: z.object({ username: z.string() }),
});

// Many failed writes still answer HTTP 200, with `code < 1` or `errors`.
export const WriteAnswerSchema = z.object({
  code: z.number().optional(),
  message: z.string().nullish(),
  errors: z.array(z.string()).optional(),
});
export type WriteAnswer = z.infer<typeof WriteAnswerSchema>;

// `/reader/add_url` and `/webfeed/subscribe`.
export const AddUrlAnswerSchema = WriteAnswerSchema.extend({ feed: UpstreamFeedSchema.nullish() });

// `/webfeed/analyze` and `/webfeed/reanalyze`. Analyze answers code 2 and `feed_address`, with no
// `request_id`, when the URL is already a feed.
export const WebFeedAnalyzeAnswerSchema = WriteAnswerSchema.extend({
  request_id: z.string().optional(),
  feed_address: z.string().optional(),
});

const WebFeedVariantSchema = z.object({
  label: z.string().nullish(),
  description: z.string().nullish(),
  story_container: z.string(),
  title: z.string(),
  link: z.string().nullish(),
  content: z.string().nullish(),
  image: z.string().nullish(),
  author: z.string().nullish(),
  date: z.string().nullish(),
  preview_stories: z
    .array(
      z.object({
        title: z.string().nullish(),
        link: z.string().nullish(),
        content: z.string().nullish(),
        image: z.string().nullish(),
      }),
    )
    .optional(),
});
export type UpstreamWebFeedVariant = z.infer<typeof WebFeedVariantSchema>;

// `/webfeed/status`: the last event of the analysis task, `type` start, progress, variants,
// complete or error, kept five minutes after each event. A complete event carries the results as
// `variants_data`. An id with no event, not started yet or expired, answers code -1 and
// `status: "unknown"`.
export const WebFeedStatusAnswerSchema = z.object({
  code: z.number(),
  type: z.string().optional(),
  message: z.string().nullish(),
  error: z.string().nullish(),
  variants_data: z
    .object({
      variants: z.array(WebFeedVariantSchema),
      html_hash: z.string().nullish(),
      page_title: z.string().nullish(),
    })
    .optional(),
});
export type WebFeedStatusAnswer = z.infer<typeof WebFeedStatusAnswerSchema>;

// Every JSON object NewsBlur answers carries these, set by its `json_view`.
export const SessionFieldsSchema = z.object({
  authenticated: z.boolean().optional(),
  user_id: z.number().optional(),
});
