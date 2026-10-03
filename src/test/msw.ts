import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createFixtureBackend, seedFixtures } from "client/api/adapters/fixture";

// Baseline handlers over fixtures/seed for the http adapter's tests, answered by the BFF core over
// a fake NewsBlur. They only read, so one backend serves every test. Per-test scenarios (auth
// failures, rate limits, ...) override these with `server.use(...)`.
const seed = createFixtureBackend({ fixtures: seedFixtures });

const fromSeed = (path: string) =>
  http.get(path, async ({ request }) => {
    const url = new URL(request.url);
    const { status, body } = await seed({
      method: "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
    });
    return new HttpResponse(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });

export const server = setupServer(
  fromSeed("/api/profile"),
  fromSeed("/api/categories"),
  fromSeed("/api/feeds"),
  fromSeed("/api/counts"),
  fromSeed("/api/search/feeds"),
);
