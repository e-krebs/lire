import type { Collection, Entry, Subscription } from "shared/feedsApi/types";
import collections from "../fixtures/seed/collections.json";
import subscriptions from "../fixtures/seed/subscriptions.json";

export const ENTRY: Entry = {
  id: "entry-1",
  fingerprint: "f1",
  title: "A long read about calm software",
  author: "Ada Example",
  crawled: Date.UTC(2026, 8, 1),
  published: Date.UTC(2026, 8, 1),
  unread: true,
  summary: { content: "Why the best tools stay out of the way, and how to build them." },
  origin: { streamId: "feed/http://example-news.test/rss", title: "Example News" },
  alternate: [{ href: "https://example-news.test/a-long-read", type: "text/html" }],
};

export const COLLECTIONS = collections as Collection[];
export const SUBSCRIPTIONS = subscriptions as Subscription[];
