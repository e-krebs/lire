// The one URL path segment a stream rides in, so a category reads as `/stream/Tech%20News`
// instead of `/stream/user%2F<uid>%2Fcategory%2FTech%20News`:
//   - `all` / `read` for the user's two built-in streams,
//   - a category's LAST id segment — a label, a uuid or a slug, opaque either way, never
//     re-derived from the category's display label,
//   - `feed:` + the feed url for a feed (the router percent-encodes it).
// The user id is not in the key, so rebuilding a full id needs the loaded profile.
// Edge: a category whose last segment is literally `all` or `read`, or starts with `feed:`,
// loses to the built-in or the feed reading — the feeds API allows such a label, this key doesn't
// round-trip it.
import {
  categoryStreamId,
  feedStreamId,
  globalAllStreamId,
  globalReadStreamId,
  isFeedStreamId,
  isGlobalAllStreamId,
  isReadStreamId,
} from "shared/feedsApi/streams";

const FEED_KEY_PREFIX = "feed:";
const FEED_ID_PREFIX = "feed/";

export const toStreamKey = (streamId: string): string => {
  if (isGlobalAllStreamId(streamId)) return "all";
  if (isReadStreamId(streamId)) return "read";
  if (isFeedStreamId(streamId)) {
    return `${FEED_KEY_PREFIX}${streamId.slice(FEED_ID_PREFIX.length)}`;
  }
  return streamId.slice(streamId.lastIndexOf("/") + 1);
};

export const fromStreamKey = ({ key, userId }: { key: string; userId: string }): string => {
  if (key === "all") return globalAllStreamId(userId);
  if (key === "read") return globalReadStreamId(userId);
  if (key.startsWith(FEED_KEY_PREFIX)) return feedStreamId(key.slice(FEED_KEY_PREFIX.length));
  return categoryStreamId({ userId, label: key });
};
