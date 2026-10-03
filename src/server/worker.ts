import { z } from "zod";
import { handle, type FeedsCache } from "shared/bff/handle";
import { encodeParams, type NewsblurFetch } from "shared/bff/upstream";
import { matchRoute } from "shared/feedsApi/routes";
import { AccessError, verifyAccess } from "./access";
import type { Env } from "./env";
import type { StoredToken } from "./newsblurAuth";

export { NewsblurAuth } from "./newsblurAuth";

const LOGIN_PATH = "/api/auth/login";
const CALLBACK_PATH = "/api/auth/callback";
const STATE_COOKIE = "lire_oauth_state";
const STATE_COOKIE_ATTRIBUTES = "HttpOnly; Secure; SameSite=Lax; Path=/api/auth";

const json = ({ body, status = 200 }: { body: unknown; status?: number }): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const newsblurAuth = (env: Env) => env.NEWSBLUR_AUTH.get(env.NEWSBLUR_AUTH.idFromName("singleton"));

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

const clearStateCookie = `${STATE_COOKIE}=; ${STATE_COOKIE_ATTRIBUTES}; Max-Age=0`;

const redirectUri = (request: Request): string => `${new URL(request.url).origin}${CALLBACK_PATH}`;

const handleLogin = ({ request, env }: { request: Request; env: Env }): Response => {
  const state = randomToken();
  const authorize = new URL("/oauth/authorize", env.NEWSBLUR_HOST);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: env.NEWSBLUR_CLIENT_ID,
    redirect_uri: redirectUri(request),
    scope: "read write",
    state,
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": `${STATE_COOKIE}=${state}; ${STATE_COOKIE_ATTRIBUTES}; Max-Age=600`,
    },
  });
};

const signInFailedPage = (): Response =>
  new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign-in failed</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
</style>
</head>
<body>
<p role="alert">Sign-in to NewsBlur failed. <a href="${LOGIN_PATH}">Try again</a>.</p>
</body>
</html>`,
    {
      status: 400,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": clearStateCookie,
      },
    },
  );

const TokenAnswerSchema = z.object({ access_token: z.string().min(1) });
const ProfileAnswerSchema = z.object({ user_profile: z.object({ user_id: z.number() }) });

const exchangeCode = async ({
  request,
  env,
  code,
}: {
  request: Request;
  env: Env;
  code: string;
}): Promise<StoredToken | undefined> => {
  const tokenResponse = await fetch(`${env.NEWSBLUR_HOST}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(request),
      client_id: env.NEWSBLUR_CLIENT_ID,
      client_secret: env.NEWSBLUR_CLIENT_SECRET,
    }),
  });
  if (!tokenResponse.ok) return undefined;
  const token = TokenAnswerSchema.safeParse(await tokenResponse.json());
  if (!token.success) return undefined;

  // The user id pins every later read answer to this account.
  const profileResponse = await fetch(`${env.NEWSBLUR_HOST}/social/load_user_profile`, {
    headers: { Authorization: `Bearer ${token.data.access_token}` },
  });
  if (!profileResponse.ok) return undefined;
  const profile = ProfileAnswerSchema.safeParse(await profileResponse.json());
  if (!profile.success) return undefined;
  return { accessToken: token.data.access_token, userId: profile.data.user_profile.user_id };
};

const handleCallback = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const cookieState = readCookie({ request, name: STATE_COOKIE });
  if (!code || !state || !cookieState || !safeEqual({ a: state, b: cookieState })) {
    return signInFailedPage();
  }

  let token: StoredToken | undefined;
  try {
    token = await exchangeCode({ request, env, code });
  } catch {
    token = undefined;
  }
  if (!token) return signInFailedPage();

  await newsblurAuth(env).setToken(token);
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": clearStateCookie },
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

const bearerUpstream =
  ({ env, accessToken }: { env: Env; accessToken: string }): NewsblurFetch =>
  async ({ method, path, query, form }) => {
    const url = new URL(path, env.NEWSBLUR_HOST);
    if (query) url.search = encodeParams(query).toString();
    const headers = { Authorization: `Bearer ${accessToken}` };
    return fetch(
      url,
      form ? { method: "POST", headers, body: encodeParams(form) } : { method, headers },
    );
  };

const serve = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const url = new URL(request.url);
  const match = matchRoute({ method: request.method, pathname: url.pathname });
  if (!match) return json({ body: { error: "not_found" }, status: 404 });

  // Access attaches its JWT to any request carrying its cookie, so writes need their own CSRF check.
  const hasBody = request.method === "POST" || request.method === "PATCH";
  if (request.method !== "GET" && !isSameOrigin(request))
    return json({ body: { error: "forbidden" }, status: 403 });
  if (hasBody && !request.headers.get("Content-Type")?.startsWith("application/json")) {
    return json({ body: { error: "forbidden" }, status: 403 });
  }

  let body: unknown;
  if (hasBody) {
    try {
      body = await request.json();
    } catch {
      return json({ body: { error: "bad_request", message: "Invalid JSON body." }, status: 400 });
    }
  }

  const auth = newsblurAuth(env);
  const token = await auth.getToken();
  if (!token) {
    if (match.route.path === "/api/auth/status") return json({ body: { signedIn: false } });
    return json({ body: { error: "sign_in_required" }, status: 401 });
  }

  const cache: FeedsCache = {
    get: async () => auth.getFeedsCache(),
    set: async (input) => auth.setFeedsCache(input),
    clear: async () => auth.clearFeedsCache(),
  };
  const result = await handle({
    route: match.route,
    params: match.params,
    query: url.searchParams,
    body,
    upstream: bearerUpstream({ env, accessToken: token.accessToken }),
    config: { newsletterAddress: env.NEWSBLUR_NEWSLETTER_ADDRESS, userId: token.userId },
    cache,
  });
  // NewsBlur rejected the token, or answered as another user, so the owner signs in again.
  if (result.status === 401) await auth.clearToken();
  if (result.body === null) return new Response(null, { status: result.status });
  return json({ body: result.body, status: result.status });
};

const route = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (pathname === LOGIN_PATH && request.method === "GET") return handleLogin({ request, env });
  if (pathname === CALLBACK_PATH && request.method === "GET")
    return handleCallback({ request, env });
  return serve({ request, env });
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
