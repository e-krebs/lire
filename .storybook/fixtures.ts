import { toLibrary } from "../src/shared/bff/library";
import { FeedsAnswerSchema } from "../src/shared/bff/upstream";
import type { Entry } from "shared/feedsApi/types";
import feedsAnswer from "../fixtures/seed/feeds.json";

export const ENTRY: Entry = {
  id: "101:0dcd64",
  feedId: "101",
  title: "A long read about calm software",
  author: "Ada Example",
  published: Date.UTC(2026, 8, 1),
  unread: true,
  summary: "Why the best tools stay out of the way, and how to build them.",
  url: "https://example-news.test/a-long-read",
};

const library = toLibrary(FeedsAnswerSchema.parse(feedsAnswer));

export const CATEGORIES = library.categories;
export const FEEDS = library.feeds;
