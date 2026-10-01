// Allowlist of feeds API endpoints this app is permitted to call. Pure string matching —
// no runtime deps — so it can gate a proxy/fetch layer without pulling anything else in.

export type HttpMethod = "GET" | "POST" | "DELETE";

interface AllowedPath {
  method: HttpMethod;
  pattern: string;
}

const ALLOWED_PATHS: readonly AllowedPath[] = [
  { method: "GET", pattern: "/v3/profile" },
  { method: "GET", pattern: "/v3/collections" },
  { method: "POST", pattern: "/v3/collections" },
  { method: "DELETE", pattern: "/v3/collections/:collectionId" },
  { method: "GET", pattern: "/v3/markers/counts" },
  { method: "GET", pattern: "/v3/streams/contents" },
  { method: "GET", pattern: "/v3/entries/:entryId" },
  { method: "POST", pattern: "/v3/markers" },
  { method: "GET", pattern: "/v3/search/feeds" },
  { method: "GET", pattern: "/v3/search/contents" },
  { method: "GET", pattern: "/v3/subscriptions" },
  { method: "POST", pattern: "/v3/subscriptions" },
  { method: "DELETE", pattern: "/v3/subscriptions/:feedId" },
  { method: "POST", pattern: "/v3/feeds/newsletters" },
  { method: "POST", pattern: "/v3/collections/:collectionId/feeds/.mput" },
  { method: "GET", pattern: "/v3/preferences" },
  { method: "POST", pattern: "/v3/preferences" },
];

interface PathMatch {
  pattern: string;
  params: Record<string, string>;
}

const segmentsOf = (path: string): string[] => path.split("/").filter(Boolean);

const matchPattern = ({
  pattern,
  pathname,
}: {
  pattern: string;
  pathname: string;
}): Record<string, string> | null => {
  const patternSegments = segmentsOf(pattern);
  const pathSegments = segmentsOf(pathname);
  if (patternSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i];
    const pathSegment = pathSegments[i];
    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = pathSegment;
    } else if (patternSegment !== pathSegment) {
      return null;
    }
  }
  return params;
};

export const matchAllowed = ({
  method,
  pathname,
}: {
  method: string;
  pathname: string;
}): PathMatch | null => {
  for (const allowed of ALLOWED_PATHS) {
    if (allowed.method !== method) continue;
    const params = matchPattern({ pattern: allowed.pattern, pathname });
    if (params) return { pattern: allowed.pattern, params };
  }
  return null;
};
