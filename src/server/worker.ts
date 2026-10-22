import { z } from "zod";
import { handle, rateLimitedBody, type FeedsCache } from "shared/bff/handle";
import { encodeParams, type NewsblurFetch } from "shared/bff/upstream";
import { matchRoute } from "shared/feedsApi/routes";
import { AccessError, verifyAccess } from "./access";
import type { Env } from "./env";
import { OAuthTokenSchema, type StoredCredential } from "./newsblurAuth";

export { NewsblurAuth } from "./newsblurAuth";

const LOGIN_PATH = "/api/auth/login";
const LOGOUT_PATH = "/api/auth/logout";
const CALLBACK_PATH = "/api/auth/callback";
const STATE_COOKIE = "lire_oauth_state";
const STATE_ATTRIBUTES = "HttpOnly; Secure; SameSite=Lax; Path=/api/auth";
const LIRE_COOKIE = {
  name: "lire_session",
  attributes: "HttpOnly; Secure; SameSite=Lax; Path=/api",
  maxAge: 180 * 24 * 60 * 60,
};

const json = ({ body, status = 200 }: { body: unknown; status?: number }): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// A new namespace invalidates legacy cookies, including numeric usernames.
const userObject = ({ env, userKey }: { env: Env; userKey: string }) =>
  env.NEWSBLUR_AUTH.get(env.NEWSBLUR_AUTH.idFromName(`user-id:${userKey}`));

const lireSetCookie = ({
  value,
  maxAge = LIRE_COOKIE.maxAge,
}: {
  value: string;
  maxAge?: number;
}): string => `${LIRE_COOKIE.name}=${value}; ${LIRE_COOKIE.attributes}; Max-Age=${maxAge}`;

const readLireSession = (request: Request): { userKey: string; token: string } | undefined => {
  const value = new RegExp(`(?:^|;\\s*)${LIRE_COOKIE.name}=([^;]*)`).exec(
    request.headers.get("Cookie") ?? "",
  )?.[1];
  const dot = value?.lastIndexOf(".") ?? -1;
  if (
    value === undefined ||
    dot <= 0 ||
    dot === value.length - 1 ||
    !/^[1-9]\d*$/.test(value.slice(0, dot))
  )
    return undefined;
  return { userKey: value.slice(0, dot), token: value.slice(dot + 1) };
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
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );

const ProfileAnswerSchema = z.object({
  user_profile: z.object({ user_id: z.number().int().positive(), username: z.string().min(1) }),
});
const USER_AGENT = { "User-Agent": "Lire" };
const callbackUri = (request: Request): string => new URL(CALLBACK_PATH, request.url).href;
const stateObject = ({ env, state }: { env: Env; state: string }) =>
  env.NEWSBLUR_AUTH.get(env.NEWSBLUR_AUTH.idFromName(`oauth:${state}`));

const handleLogin = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const state = crypto.randomUUID();
  await stateObject({ env, state }).createState();
  const url = new URL("/oauth/authorize", env.NEWSBLUR_HOST);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env.NEWSBLUR_OAUTH_CLIENT_ID,
    redirect_uri: callbackUri(request),
    state,
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.href,
      "Cache-Control": "no-store",
      "Set-Cookie": `${STATE_COOKIE}=${state}; ${STATE_ATTRIBUTES}; Max-Age=600`,
    },
  });
};

const handleCallback = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const cookie = /(?:^|;\s*)lire_oauth_state=([^;]*)/.exec(
    request.headers.get("Cookie") ?? "",
  )?.[1];
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Set-Cookie": `${STATE_COOKIE}=; ${STATE_ATTRIBUTES}; Max-Age=0`,
  });
  const failure = ({ step, status }: { step: string; status?: number | string }) => {
    console.error("oauth callback failed", { step, status });
    const response = signInFailedPage();
    response.headers.set("Set-Cookie", headers.get("Set-Cookie")!);
    return response;
  };
  if (!state || state !== cookie || !(await stateObject({ env, state }).consumeState()))
    return failure({
      step: "state",
      status: !state ? "no-state" : state !== cookie ? "cookie" : "consume",
    });
  const code = params.get("code");
  if (!code || params.has("error"))
    return failure({ step: "authorize", status: params.get("error") ?? "no-code" });
  let step = "token";
  try {
    const response = await fetch(new URL("/oauth/token", env.NEWSBLUR_HOST), {
      method: "POST",
      headers: USER_AGENT,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: env.NEWSBLUR_OAUTH_CLIENT_ID,
        client_secret: env.NEWSBLUR_OAUTH_CLIENT_SECRET,
        redirect_uri: callbackUri(request),
      }),
    });
    if (!response.ok) return failure({ step, status: response.status });
    step = "token-parse";
    const tokens = OAuthTokenSchema.parse(await response.json());
    step = "profile";
    const profileResponse = await fetch(new URL("/social/load_user_profile", env.NEWSBLUR_HOST), {
      headers: { ...USER_AGENT, Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) return failure({ step, status: profileResponse.status });
    step = "profile-parse";
    const { user_profile: profile } = ProfileAnswerSchema.parse(await profileResponse.json());
    step = "sign-in";
    const userKey = String(profile.user_id);
    const auth = userObject({ env, userKey });
    const previous = readLireSession(request);
    const token = await auth.signIn({
      credential: {
        kind: "token",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        userId: profile.user_id,
        username: profile.username,
        revision: crypto.randomUUID(),
      },
      previousToken: previous?.userKey === userKey ? previous.token : undefined,
    });
    headers.set("Location", "/");
    headers.append("Set-Cookie", lireSetCookie({ value: `${userKey}.${token}` }));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return failure({ step, status: error instanceof Error ? error.name : "unknown" });
  }
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

const isJson = (request: Request): boolean =>
  !!request.headers.get("Content-Type")?.startsWith("application/json");

const handleLogout = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  if (!isSameOrigin(request) || !isJson(request))
    return json({ body: { error: "forbidden" }, status: 403 });
  const previous = readLireSession(request);
  if (previous) await userObject({ env, userKey: previous.userKey }).revokeToken(previous.token);
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store", "Set-Cookie": lireSetCookie({ value: "", maxAge: 0 }) },
  });
};

const tokenUpstream =
  ({ env, accessToken }: { env: Env; accessToken: string }): NewsblurFetch =>
  async ({ method, path, query, form }) => {
    const url = new URL(path, env.NEWSBLUR_HOST);
    if (query) url.search = encodeParams(query).toString();
    const headers = { ...USER_AGENT, Authorization: `Bearer ${accessToken}` };
    return fetch(
      url,
      form ? { method: "POST", headers, body: encodeParams(form) } : { method, headers },
    );
  };

const geoOf = (request: Request): { lat: number; lon: number; timezone: string } | undefined => {
  if (!request.cf) return undefined;
  const { latitude, longitude, timezone } = request.cf;
  if (!latitude || !longitude || typeof timezone !== "string" || !timezone) return undefined;
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, timezone } : undefined;
};

const serve = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const url = new URL(request.url);
  const match = matchRoute({ method: request.method, pathname: url.pathname });
  if (!match) return json({ body: { error: "not_found" }, status: 404 });

  // Access attaches its JWT to any request carrying its cookie, so writes need their own CSRF check.
  const hasBody = request.method === "POST" || request.method === "PATCH";
  if (request.method !== "GET" && !isSameOrigin(request))
    return json({ body: { error: "forbidden" }, status: 403 });
  if (hasBody && !isJson(request)) {
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

  const signedOut = (): Response =>
    match.route.path === "/api/auth/status"
      ? json({ body: { signedIn: false } })
      : json({ body: { error: "sign_in_required" }, status: 401 });

  const lire = readLireSession(request);
  if (!lire) return signedOut();
  const auth = userObject({ env, userKey: lire.userKey });
  if (!(await auth.hasToken(lire.token))) return signedOut();

  const session = await auth.getSession();
  if (!session) return signedOut();

  const cache: FeedsCache = {
    get: async () => auth.getFeedsCache(),
    set: async (input) => auth.setFeedsCache(input),
    clear: async () => auth.clearFeedsCache(),
  };
  const run = async (current: StoredCredential) =>
    handle({
      route: match.route,
      params: match.params,
      query: url.searchParams,
      body,
      upstream: tokenUpstream({ env, accessToken: current.accessToken }),
      config: {
        userId: current.userId,
        geo: geoOf(request),
      },
      cache,
    });
  let result = await run(session);
  let used = session;
  // A write may have partly landed before the rejection.
  if (result.status === 401 && request.method === "GET") {
    const fresh = await auth.refreshSession({ revision: session.revision });
    if (fresh === "rate_limited") return json({ body: rateLimitedBody(), status: 429 });
    if (fresh === "transient") return json({ body: { error: "upstream_error" }, status: 502 });
    if (fresh) {
      used = fresh;
      result = await run(fresh);
    }
  }
  if (result.status === 401) await auth.clearSession({ onlyRevision: used.revision });
  if (result.body === null)
    return new Response(null, { status: result.status, headers: { "Cache-Control": "no-store" } });
  return json({ body: result.body, status: result.status });
};

const route = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (pathname === LOGIN_PATH && request.method === "GET") return handleLogin({ request, env });
  if (pathname === CALLBACK_PATH && request.method === "GET")
    return handleCallback({ request, env });
  if (pathname === LOGOUT_PATH && request.method === "POST") return handleLogout({ request, env });
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
