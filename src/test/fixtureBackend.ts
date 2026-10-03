import { http, HttpResponse } from "msw";
import { fixtureTransport } from "client/api/adapters/fixture";
import type { HttpMethod } from "shared/feedsApi/routes";
import { server } from "test/msw";

const readBody = async (request: Request): Promise<unknown> => {
  const text = await request.text();
  return text === "" ? undefined : (JSON.parse(text) as unknown);
};

const METHODS: readonly string[] = ["GET", "POST", "PATCH", "DELETE"] satisfies HttpMethod[];
const isHttpMethod = (method: string): method is HttpMethod => METHODS.includes(method);

// A 204 can't carry a body, not even `null`.
const toResponse = ({ status, body }: { status: number; body: unknown }): HttpResponse<string> =>
  status === 204
    ? new HttpResponse(null, { status })
    : new HttpResponse(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });

// Forwards every /api/* request to the real fixtureTransport, so a test in real mode keeps the
// fixture's state across requests. A more specific `server.use` handler can hold or fail one path.
export const fixtureBackend = http.all("/api/*", async ({ request }) => {
  const { method } = request;
  if (!isHttpMethod(method)) return HttpResponse.json({ error: "not_found" }, { status: 404 });
  const url = new URL(request.url);
  const response = await fixtureTransport({
    method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body: await readBody(request),
  });
  return toResponse({ status: response.status, body: await response.json() });
});

export interface LoggedRequest {
  method: string;
  // The full `/api/...` path.
  path: string;
  body: unknown;
}

// Records each request the server sees. The caller removes the listener with
// `server.events.removeAllListeners()`.
export const logRequests = () => {
  const pending: Promise<LoggedRequest>[] = [];
  server.events.on("request:start", ({ request }) => {
    const clone = request.clone();
    const path = new URL(clone.url).pathname;
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
