// The one URL path segment a stream rides in. Folder labels and feed ids are opaque: a folder
// keeps its title as-is, a feed its numeric id. The router percent-encodes the key.

export type StreamKey = "all" | "read" | `folder:${string}` | `feed:${string}`;

export type Stream =
  | { kind: "all" }
  | { kind: "read" }
  | { kind: "folder"; label: string }
  | { kind: "feed"; feedId: string };

const FOLDER_PREFIX = "folder:";
const FEED_PREFIX = "feed:";
const FEED_ID = /^\d+$/;

export const toStreamKey = (stream: Stream): StreamKey => {
  if (stream.kind === "folder") return `${FOLDER_PREFIX}${stream.label}`;
  if (stream.kind === "feed") return `${FEED_PREFIX}${stream.feedId}`;
  return stream.kind;
};

export const parseStreamKey = (key: string): Stream | null => {
  if (key === "all") return { kind: "all" };
  if (key === "read") return { kind: "read" };
  if (key.startsWith(FOLDER_PREFIX)) {
    const label = key.slice(FOLDER_PREFIX.length);
    return label ? { kind: "folder", label } : null;
  }
  if (key.startsWith(FEED_PREFIX)) {
    const feedId = key.slice(FEED_PREFIX.length);
    return FEED_ID.test(feedId) ? { kind: "feed", feedId } : null;
  }
  return null;
};
