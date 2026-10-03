// A category id is its folder title, so a test names a category by its label and reads the id
// (or the URL key) back from the seed, which keeps the test true if the two ever diverge.
import { toLibrary } from "shared/bff/library";
import { FeedsAnswerSchema } from "shared/bff/upstream";
import { toStreamKey, type StreamKey } from "shared/feedsApi/streamKey";
import type { Category } from "shared/feedsApi/types";
import feeds from "fixtures/seed/feeds.json";

export const seedCategories: Category[] = toLibrary(FeedsAnswerSchema.parse(feeds)).categories;

export const seedCategoryId = (label: string): string => {
  const category = seedCategories.find((candidate) => candidate.label === label);
  if (!category) throw new Error(`No seed category labelled "${label}"`);
  return category.id;
};

export const seedCategoryKey = (label: string): StreamKey =>
  toStreamKey({ kind: "folder", label: seedCategoryId(label) });
