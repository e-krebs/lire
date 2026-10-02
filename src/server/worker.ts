import { matchAllowed } from "shared/feedsApi/paths";
import { AccessError, verifyAccess } from "./access";
import type { Env } from "./env";
import type { AccessTokenResult } from "./feedlyAuth";

export { FeedlyAuth } from "./feedlyAuth";

const LOGIN_PATH = "/api/auth/login";
const CSRF_COOKIE = "lire_csrf";
const CSRF_FIELD = "csrf";
const TOKEN_FIELD = "refreshToken";

const json = ({ body, status = 200 }: { body: unknown; status?: number }): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const feedlyAuth = (env: Env) => env.FEEDLY_AUTH.get(env.FEEDLY_AUTH.idFromName("singleton"));

const randomToken = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

const safeEqual = ({ a, b }: { a: string; b: string }): boolean => {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  return left.byteLength === right.byteLength && crypto.subtle.timingSafeEqual(left, right);
};

const readCookie = ({ request, name }: { request: Request; name: string }): string | undefined => {
  for (const part of request.headers.get("Cookie")?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
};

const loginPage = ({
  error,
  status = 200,
}: { error?: boolean; status?: number } = {}): Response => {
  const csrf = randomToken();
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in to Lire</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
  form { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 360px; }
  input, button { font: inherit; padding: 8px 12px; border-radius: 6px; }
  button { cursor: pointer; }
  .error { color: #c62828; margin: 0; }
</style>
</head>
<body>
<form method="post" action="${LOGIN_PATH}">
  <label for="${TOKEN_FIELD}">Feedly refresh token</label>
  <input id="${TOKEN_FIELD}" name="${TOKEN_FIELD}" type="password" autocomplete="off" required>
  <input type="hidden" name="${CSRF_FIELD}" value="${csrf}">
  ${error ? `<p class="error" role="alert">Sign-in failed, try again.</p>` : ""}
  <button type="submit">Sign in</button>
</form>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": `${CSRF_COOKIE}=${csrf}; Path=${LOGIN_PATH}; HttpOnly; Secure; SameSite=Strict`,
    },
  });
};

const isSameOrigin = (request: Request): boolean => {
  const own = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  if (origin) return origin === own;
  const referer = request.headers.get("Referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === own;
  } catch {
    return false;
  }
};

const formString = ({ form, name }: { form: FormData; name: string }): string | undefined => {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
};

const handleLogin = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!isSameOrigin(request)) return json({ body: { error: "forbidden" }, status: 403 });

  const form = await request.formData();
  const cookieToken = readCookie({ request, name: CSRF_COOKIE });
  const formToken = formString({ form, name: CSRF_FIELD });
  if (!cookieToken || !formToken || !safeEqual({ a: cookieToken, b: formToken })) {
    return json({ body: { error: "forbidden" }, status: 403 });
  }

  const refreshToken = formString({ form, name: TOKEN_FIELD })?.trim();
  if (!refreshToken) return loginPage({ error: true, status: 400 });

  const result = await feedlyAuth(env).replaceRefreshToken(refreshToken);
  if (!result.ok) {
    return loginPage({ error: true, status: result.reason === "unavailable" ? 503 : 400 });
  }
  return new Response(null, { status: 302, headers: { Location: "/" } });
};

const refreshFailed = (reason: Exclude<AccessTokenResult, { ok: true }>["reason"]): Response =>
  reason === "unavailable"
    ? json({ body: { error: "upstream_unavailable" }, status: 503 })
    : json({ body: { error: "sign_in_required" }, status: 401 });

const proxy = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const url = new URL(request.url);
  const pathname = url.pathname.slice("/api".length);
  if (!matchAllowed({ method: request.method, pathname }))
    return json({ body: { error: "not_found" }, status: 404 });

  // Access attaches its JWT to any request carrying its cookie, so writes need their own CSRF check.
  const hasBody = request.method === "POST";
  if (request.method !== "GET" && !isSameOrigin(request))
    return json({ body: { error: "forbidden" }, status: 403 });
  if (hasBody && !request.headers.get("Content-Type")?.startsWith("application/json")) {
    return json({ body: { error: "forbidden" }, status: 403 });
  }

  const auth = feedlyAuth(env);
  const first = await auth.getAccessToken();
  if (!first.ok) return refreshFailed(first.reason);

  const body = hasBody ? await request.arrayBuffer() : undefined;
  const send = async (token: string): Promise<Response> =>
    fetch(`${env.FEEDLY_HOST}${pathname}${url.search}`, {
      method: request.method,
      headers: {
        Authorization: `OAuth ${token}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body,
    });

  let upstream = await send(first.token);
  if (upstream.status === 401) {
    await upstream.body?.cancel();
    const retry = await auth.getAccessToken({ rejectedAccessToken: first.token });
    if (!retry.ok) return refreshFailed(retry.reason);
    upstream = await send(retry.token);
    // The feeds API just accepted the refresh token, so a 401 here is not a reason to drop it.
    if (upstream.status === 401) {
      await upstream.body?.cancel();
      return json({ body: { error: "sign_in_required" }, status: 401 });
    }
  }

  const headers = new Headers();
  for (const [name, value] of upstream.headers) {
    if (name === "content-type") headers.set(name, value);
    // TEMP diagnostic for the "not an IP string literal" 400: remove once the cause is known.
    if (upstream.status >= 400 && ["x-feedly-server", "cf-ray", "server", "via"].includes(name))
      headers.set(`x-upstream-${name}`, value);
  }
  if (upstream.status >= 400) headers.set("x-upstream-status", String(upstream.status));
  return new Response(upstream.body, { status: upstream.status, headers });
};

const route = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/auth/status" && request.method === "GET") {
    return json({ body: { signedIn: await feedlyAuth(env).hasRefreshToken() } });
  }
  if (pathname === LOGIN_PATH && request.method === "GET") return loginPage();
  if (pathname === LOGIN_PATH && request.method === "POST") return handleLogin({ request, env });
  if (pathname.startsWith("/api/v3/")) return proxy({ request, env });
  return json({ body: { error: "not_found" }, status: 404 });
};

export default {
  async fetch(request, env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith("/api/"))
      return json({ body: { error: "not_found" }, status: 404 });
    try {
      await verifyAccess({ request, env });
    } catch (error) {
      if (error instanceof AccessError) return json({ body: { error: "forbidden" }, status: 403 });
      throw error;
    }
    return route({ request, env });
  },
} satisfies ExportedHandler<Env>;
