import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import profile from "fixtures/seed/profile.json";
import collections from "fixtures/seed/collections.json";
import subscriptions from "fixtures/seed/subscriptions.json";
import markersCounts from "fixtures/seed/markers-counts.json";
import searchFeeds from "fixtures/seed/search-feeds.json";

// Baseline handlers over fixtures/seed for the http adapter's tests. Per-test scenarios (auth
// failures, rate limits, ...) override these with `server.use(...)`.
export const server = setupServer(
  http.get("/api/v3/profile", () => HttpResponse.json(profile)),
  http.get("/api/v3/collections", () => HttpResponse.json(collections)),
  http.get("/api/v3/subscriptions", () => HttpResponse.json(subscriptions)),
  http.get("/api/v3/markers/counts", () => HttpResponse.json(markersCounts)),
  http.get("/api/v3/search/feeds", () => HttpResponse.json(searchFeeds)),
);
