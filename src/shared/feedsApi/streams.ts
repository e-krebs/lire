// Stream-id builders. IDs are returned as-is (not URL-encoded) — encoding is the
// caller's job when it lands one in a query string.

export const categoryStreamId = ({ userId, label }: { userId: string; label: string }): string =>
  `user/${userId}/category/${label}`;

export const globalAllStreamId = (userId: string): string =>
  categoryStreamId({ userId, label: "global.all" });

export const isGlobalAllStreamId = (streamId: string): boolean =>
  streamId.endsWith("/category/global.all");

export const globalUncategorizedStreamId = (userId: string): string =>
  categoryStreamId({ userId, label: "global.uncategorized" });

export const isGlobalUncategorizedStreamId = (streamId: string): boolean =>
  streamId.endsWith("/category/global.uncategorized");

// The feeds API's built-in tag holding the entries the user read most recently, newest read first.
export const globalReadStreamId = (userId: string): string => `user/${userId}/tag/global.read`;

export const isReadStreamId = (streamId: string): boolean => streamId.endsWith("/tag/global.read");

export const feedStreamId = (url: string): string => `feed/${url}`;

export const isFeedStreamId = (streamId: string): boolean => streamId.startsWith("feed/");
