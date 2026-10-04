export const EMPTY_SCENES = [
  "hammock",
  "bath",
  "spring",
  "autumn",
  "winter",
  "fishing",
  "cat",
  "rooftop",
  "boat",
  "beach",
  "alpine-lake",
  "bivouac",
  "hut-terrace",
  "coastal-bench",
  "lighthouse-jetty",
  "granite-cottage",
] as const;

export type EmptyScene = (typeof EMPTY_SCENES)[number];
