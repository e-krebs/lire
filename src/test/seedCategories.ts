// Seed category ids end in a uuid, like a live account's, so a test names a category by
// its label and reads the id (or the URL key) back from the fixture instead of repeating a uuid.
import collections from "fixtures/seed/collections.json";
import { toStreamKey } from "shared/feedsApi/streamKey";

export const seedCategoryId = (label: string): string => {
  const collection = collections.find((candidate) => candidate.label === label);
  if (!collection) throw new Error(`No seed category labelled "${label}"`);
  return collection.id;
};

export const seedCategoryKey = (label: string): string => toStreamKey(seedCategoryId(label));
