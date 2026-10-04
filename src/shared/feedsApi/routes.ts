// The Lire API the Worker serves to the client. Pure string matching, no runtime deps, so the
// Worker can route on it and the client can build its calls from the same list.

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

/** @public Read by the route tests. */
export const ROUTES = [
  { method: "GET", path: "/api/auth/status" },
  { method: "GET", path: "/api/profile" },
  { method: "GET", path: "/api/categories" },
  { method: "POST", path: "/api/categories" },
  { method: "PATCH", path: "/api/categories/:categoryId" },
  { method: "DELETE", path: "/api/categories/:categoryId" },
  { method: "GET", path: "/api/feeds" },
  { method: "POST", path: "/api/feeds" },
  { method: "PATCH", path: "/api/feeds/:feedId" },
  { method: "DELETE", path: "/api/feeds/:feedId" },
  { method: "GET", path: "/api/counts" },
  { method: "GET", path: "/api/streams/:streamKey/entries" },
  { method: "GET", path: "/api/entries/:entryId" },
  { method: "POST", path: "/api/entries/read" },
  { method: "POST", path: "/api/entries/unread" },
  { method: "GET", path: "/api/search/entries" },
  { method: "GET", path: "/api/search/feeds" },
  { method: "GET", path: "/api/preferences" },
  { method: "POST", path: "/api/preferences" },
  { method: "GET", path: "/api/newsletter-address" },
  { method: "GET", path: "/api/sun" },
] as const satisfies readonly { method: HttpMethod; path: string }[];

export type Route = (typeof ROUTES)[number];

interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

const segmentsOf = (path: string): string[] => path.split("/").filter(Boolean);

// Params come back percent-decoded; a segment that fails to decode matches nothing.
const matchPath = ({
  path,
  pathname,
}: {
  path: string;
  pathname: string;
}): Record<string, string> | null => {
  const routeSegments = segmentsOf(path);
  const pathSegments = segmentsOf(pathname);
  if (routeSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < routeSegments.length; i++) {
    const routeSegment = routeSegments[i];
    const pathSegment = pathSegments[i];
    if (routeSegment.startsWith(":")) {
      try {
        params[routeSegment.slice(1)] = decodeURIComponent(pathSegment);
      } catch {
        return null;
      }
    } else if (routeSegment !== pathSegment) {
      return null;
    }
  }
  return params;
};

export const matchRoute = ({
  method,
  pathname,
}: {
  method: string;
  pathname: string;
}): RouteMatch | null => {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const params = matchPath({ path: route.path, pathname });
    if (params) return { route, params };
  }
  return null;
};
