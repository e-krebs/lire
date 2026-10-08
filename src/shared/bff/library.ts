import type { Category, Feed } from "shared/feedsApi/types";
import { NEWSBLUR_ORIGIN, type FeedsAnswer, type FolderItem, type UpstreamFeed } from "./upstream";

// A folder path from the top level, `[]` for a feed at the top level.
export type FolderPath = string[];

export interface Subscription {
  feed: Feed;
  // Every placement of the feed in the tree, for writes that must name the exact folder.
  placements: FolderPath[];
}

export interface Library {
  feeds: Feed[];
  categories: Category[];
  subscriptions: Map<string, Subscription>;
}

const NEWSLETTER_PREFIX = "newsletter:";
const WEB_FEED_PREFIX = "webfeed:";

// A web feed's address is its page URL behind a prefix.
export const webFeedPageOf = (feedUrl: string): string =>
  feedUrl.startsWith(WEB_FEED_PREFIX) ? feedUrl.slice(WEB_FEED_PREFIX.length) : feedUrl;

// A newsletter's address is `newsletter:<user pk>:<sender email>`, or `list-id:<id>` in place of
// the email when the mail carried a List-ID header.
const senderEmailOf = (feedUrl: string): string | undefined => {
  if (!feedUrl.startsWith(NEWSLETTER_PREFIX)) return undefined;
  const sender = feedUrl.split(":").slice(2).join(":");
  return /^[^\s@:]+@[^\s@:]+$/.test(sender) ? sender : undefined;
};

const collectPlacements = (items: FolderItem[]): Map<string, FolderPath[]> => {
  const placements = new Map<string, FolderPath[]>();
  const walk = ({ children, path }: { children: FolderItem[]; path: FolderPath }) => {
    for (const item of children) {
      if (typeof item === "number") {
        const feedId = String(item);
        placements.set(feedId, [...(placements.get(feedId) ?? []), path]);
        continue;
      }
      for (const [title, nested] of Object.entries(item)) {
        walk({ children: nested, path: [...path, title] });
      }
    }
  };
  walk({ children: items, path: [] });
  return placements;
};

const iconUrlOf = (favicon: string | null | undefined): string | undefined =>
  favicon ? new URL(favicon, NEWSBLUR_ORIGIN).href : undefined;

export const categoryIdsOf = (paths: FolderPath[]): string[] => [
  ...new Set(paths.flatMap((path) => path.slice(0, 1))),
];

const optionalSender = (feedUrl: string): { senderEmail?: string } => {
  const senderEmail = senderEmailOf(feedUrl);
  return senderEmail === undefined ? {} : { senderEmail };
};

export const toFeed = ({
  upstream,
  categoryIds,
}: {
  upstream: UpstreamFeed;
  categoryIds: string[];
}): Feed => ({
  id: String(upstream.id),
  title: upstream.feed_title,
  siteUrl: upstream.feed_link ?? undefined,
  feedUrl: upstream.feed_address,
  iconUrl: iconUrlOf(upstream.favicon_url),
  categoryIds,
  isNewsletter: upstream.feed_address.startsWith(NEWSLETTER_PREFIX),
  ...optionalSender(upstream.feed_address),
  // Left out on other feeds, so their literals need no `isWebFeed: false`.
  ...((upstream.is_webfeed ?? upstream.feed_address.startsWith(WEB_FEED_PREFIX))
    ? { isWebFeed: true }
    : {}),
});

// Only top-level folders become categories; a nested folder's feeds count under its top-level one.
export const toLibrary = (answer: FeedsAnswer): Library => {
  const subscriptions = new Map<string, Subscription>();
  const categoryFeeds = new Map<string, Set<string>>();
  for (const [feedId, placements] of collectPlacements(answer.folders)) {
    if (!(feedId in answer.feeds)) continue;
    const categoryIds = categoryIdsOf(placements);
    subscriptions.set(feedId, {
      feed: toFeed({ upstream: answer.feeds[feedId], categoryIds }),
      placements,
    });
    for (const categoryId of categoryIds) {
      categoryFeeds.set(categoryId, (categoryFeeds.get(categoryId) ?? new Set()).add(feedId));
    }
  }

  const categories: Category[] = [];
  for (const item of answer.folders) {
    if (typeof item === "number") continue;
    for (const title of Object.keys(item)) {
      if (categories.some((category) => category.id === title)) continue;
      categories.push({ id: title, label: title, feedIds: [...(categoryFeeds.get(title) ?? [])] });
    }
  }
  const feeds = [...subscriptions.values()].map((subscription) => subscription.feed);
  return { feeds, categories, subscriptions };
};
