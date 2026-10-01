import { http, HttpResponse } from "msw";
import { fixtureTransport } from "client/api/adapters/fixture";
import type { TransportRequest } from "client/api/transport";
import type { HttpMethod } from "shared/feedsApi/paths";
import { server } from "test/msw";

const API_PREFIX = "/api";

// URL query values arrive as strings, but fixtureTransport checks these specific keys for a
// boolean or a number (see fixture.ts's `unreadOnly` and `count` handling). Every other key,
// including free-text search, stays a string.
const BOOLEAN_QUERY_KEYS: readonly string[] = ["unreadOnly"];
const NUMBER_QUERY_KEYS: readonly string[] = ["count"];

const parseQueryValue = ({
  key,
  value,
}: {
  key: string;
  value: string;
}): string | number | boolean => {
  if (BOOLEAN_QUERY_KEYS.includes(key)) {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  if (NUMBER_QUERY_KEYS.includes(key) && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return value;
};

const readBody = async (request: Request): Promise<unknown> => {
  const text = await request.text();
  return text === "" ? undefined : (JSON.parse(text) as unknown);
};

const METHODS: readonly string[] = ["GET", "POST", "DELETE"] satisfies HttpMethod[];
const isHttpMethod = (method: string): method is HttpMethod => METHODS.includes(method);

const toTransportRequest = async ({
  request,
  method,
}: {
  request: Request;
  method: HttpMethod;
}): Promise<TransportRequest> => {
  const url = new URL(request.url);
  const query = Object.fromEntries(
    [...url.searchParams].map(([key, value]) => [key, parseQueryValue({ key, value })]),
  );
  return {
    method,
    path: url.pathname.slice(API_PREFIX.length),
    query,
    body: await readBody(request),
  };
};

// Forwards every /api/* request to the real fixtureTransport, so a test in real mode keeps the
// fixture's state across requests. A more specific `server.use` handler can hold or fail one path.
export const fixtureBackend = http.all(`${API_PREFIX}/*`, async ({ request }) => {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === `${API_PREFIX}/auth/status`) {
    return HttpResponse.json({ signedIn: true });
  }
  const { method } = request;
  if (!isHttpMethod(method)) return HttpResponse.json({ error: "not_found" }, { status: 404 });
  const response = await fixtureTransport(await toTransportRequest({ request, method }));
  return new HttpResponse(JSON.stringify(await response.json()), {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
});

export interface LoggedRequest {
  method: string;
  path: string;
  body: unknown;
}

// Records each request the server sees. The caller removes the listener with
// `server.events.removeAllListeners()`.
export const logRequests = () => {
  const pending: Promise<LoggedRequest>[] = [];
  server.events.on("request:start", ({ request }) => {
    const clone = request.clone();
    const path = new URL(clone.url).pathname.slice(API_PREFIX.length);
    pending.push(readBody(clone).then((body) => ({ method: clone.method, path, body })));
  });
  return {
    async find({ method, path }: { method: string; path?: string }): Promise<LoggedRequest[]> {
      const requests = await Promise.all(pending);
      return requests.filter(
        (request) => request.method === method && (path === undefined || request.path === path),
      );
    },
    clear(): void {
      pending.length = 0;
    },
  };
};
