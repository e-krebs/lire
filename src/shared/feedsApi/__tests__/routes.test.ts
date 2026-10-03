import { describe, expect, it } from "vitest";
import { matchRoute, ROUTES } from "shared/feedsApi/routes";

describe("matchRoute", () => {
  it("matches a static route", () => {
    expect(matchRoute({ method: "GET", pathname: "/api/counts" })).toEqual({
      route: { method: "GET", path: "/api/counts" },
      params: {},
    });
  });

  it("decodes path params", () => {
    expect(
      matchRoute({ method: "GET", pathname: "/api/streams/folder%3ATech%20News%2FA/entries" }),
    ).toEqual({
      route: { method: "GET", path: "/api/streams/:streamKey/entries" },
      params: { streamKey: "folder:Tech News/A" },
    });
  });

  it("tells routes apart by method", () => {
    expect(matchRoute({ method: "PATCH", pathname: "/api/feeds/42" })?.route.method).toBe("PATCH");
    expect(matchRoute({ method: "DELETE", pathname: "/api/feeds/42" })?.params).toEqual({
      feedId: "42",
    });
    expect(matchRoute({ method: "PUT", pathname: "/api/feeds/42" })).toBeNull();
  });

  it("prefers a static segment listed first", () => {
    expect(matchRoute({ method: "POST", pathname: "/api/entries/read" })?.route.path).toBe(
      "/api/entries/read",
    );
  });

  it.for(["/api", "/api/unknown", "/api/feeds/42/extra", "/profile", "/api/entries/%E0%A4%A"])(
    "rejects %s",
    (pathname) => {
      expect(matchRoute({ method: "GET", pathname })).toBeNull();
    },
  );

  it("matches every listed route against its own path", () => {
    for (const route of ROUTES) {
      const pathname = route.path.replaceAll(/:\w+/g, "x");
      expect(matchRoute({ method: route.method, pathname })?.route).toEqual(route);
    }
  });
});
