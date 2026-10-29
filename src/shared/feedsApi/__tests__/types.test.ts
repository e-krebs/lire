import { describe, expect, it } from "vitest";
import {
  EntrySchema,
  OnboardingPatchSchema,
  OnboardingStateSchema,
  PreferencesUpdateSchema,
  SearchEntriesQuerySchema,
  StreamEntriesQuerySchema,
} from "shared/feedsApi/types";
import { CATEGORY_ORDER_KEY, directOpenKey } from "shared/feedsApi/preferences";

describe("feedsApi types", () => {
  it("reads query strings into typed values", () => {
    expect(
      StreamEntriesQuerySchema.parse({
        count: "20",
        unreadOnly: "true",
        order: "oldest",
        cursor: "eyJwYWdlIjoyfQ",
      }),
    ).toEqual({ count: 20, unreadOnly: true, order: "oldest", cursor: "eyJwYWdlIjoyfQ" });
    expect(StreamEntriesQuerySchema.parse({})).toEqual({});
  });

  it.for([
    { count: "0" },
    { count: "51" },
    { count: "two" },
    { unreadOnly: "maybe" },
    { order: "random" },
  ])("rejects the stream query %o", (query) => {
    expect(StreamEntriesQuerySchema.safeParse(query).success).toBe(false);
  });

  it("needs a stream and a query to search entries", () => {
    expect(SearchEntriesQuerySchema.safeParse({ streamKey: "all", q: "" }).success).toBe(false);
    expect(SearchEntriesQuerySchema.parse({ streamKey: "all", q: "rust" })).toEqual({
      streamKey: "all",
      q: "rust",
    });
  });

  it("keeps entry fields it does not know", () => {
    const entry = { id: "42:abc", feedId: "42", published: 1, unread: true, starred: false };
    expect(EntrySchema.parse(entry)).toEqual(entry);
  });

  it("takes a null preference as a delete", () => {
    expect(PreferencesUpdateSchema.parse({ a: "1", b: null })).toEqual({ a: "1", b: null });
  });

  it("accepts stored onboarding state and tick or untick patches", () => {
    expect(
      OnboardingStateSchema.parse({ done: { language: true }, collapsed: false, dismissed: true }),
    ).toEqual({ done: { language: true }, collapsed: false, dismissed: true });
    expect(OnboardingPatchSchema.parse({ done: { addFeed: true, folders: false } })).toEqual({
      done: { addFeed: true, folders: false },
    });
    expect(OnboardingPatchSchema.safeParse({ done: { install: true } }).success).toBe(false);
  });

  it("namespaces Lire's preference keys", () => {
    expect(CATEGORY_ORDER_KEY).toBe("lire.categoryOrder");
    expect(directOpenKey("42")).toBe("lire.directOpen.42");
  });
});
