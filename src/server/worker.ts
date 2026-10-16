import { z } from "zod";
import { handle, type FeedsCache } from "shared/bff/handle";
import { encodeParams, type NewsblurFetch } from "shared/bff/upstream";
import { matchRoute } from "shared/feedsApi/routes";
import { AccessError, verifyAccess } from "./access";
import type { Env } from "./env";
import type { StoredCredential } from "./newsblurAuth";

export { NewsblurAuth } from "./newsblurAuth";

const LOGIN_PATH = "/api/auth/login";
const LOGOUT_PATH = "/api/auth/logout";
const NEWSBLUR_SESSION_COOKIE = "newsblur_sessionid";
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

// The key is the NewsBlur username, the one the session cookie carries.
const userObject = ({ env, userKey }: { env: Env; userKey: string }) =>
  env.NEWSBLUR_AUTH.get(env.NEWSBLUR_AUTH.idFromName(`user:${userKey}`));

const lireSetCookie = ({
  value,
  maxAge = LIRE_COOKIE.maxAge,
}: {
  value: string;
  maxAge?: number;
}): string => `${LIRE_COOKIE.name}=${value}; ${LIRE_COOKIE.attributes}; Max-Age=${maxAge}`;

// Splits on the last dot: a NewsBlur username may hold dots, and a base64url token holds none.
const readLireSession = (request: Request): { userKey: string; token: string } | undefined => {
  const value = new RegExp(`(?:^|;\\s*)${LIRE_COOKIE.name}=([^;]*)`).exec(
    request.headers.get("Cookie") ?? "",
  )?.[1];
  const dot = value?.lastIndexOf(".") ?? -1;
  if (value === undefined || dot <= 0 || dot === value.length - 1) return undefined;
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

const LoginAnswerSchema = z.object({ authenticated: z.boolean() });
const ProfileAnswerSchema = z.object({ user_profile: z.object({ user_id: z.number() }) });

const readSessionId = (response: Response): string | undefined => {
  for (const line of response.headers.getSetCookie()) {
    const match = new RegExp(`^${NEWSBLUR_SESSION_COOKIE}=([^;]+)`).exec(line);
    if (match) return match[1];
  }
  return undefined;
};

// NewsBlur answers 403 "User agent banned: missing" to a request with no User-Agent, which is what a
// Worker sends by default.
const USER_AGENT = { "User-Agent": "Lire" };

const sessionCookie = (sessionId: string) => ({
  ...USER_AGENT,
  Cookie: `${NEWSBLUR_SESSION_COOKIE}=${sessionId}`,
});

const failLogin = (reason: string): StoredCredential | undefined => {
  console.warn(`NewsBlur login failed: ${reason}`);
  return undefined;
};

const logIn = async (env: Env): Promise<StoredCredential | undefined> => {
  try {
    const loginResponse = await fetch(`${env.NEWSBLUR_HOST}/api/login`, {
      method: "POST",
      headers: USER_AGENT,
      body: new URLSearchParams({
        username: env.NEWSBLUR_USERNAME,
        password: env.NEWSBLUR_PASSWORD,
      }),
    });
    if (!loginResponse.ok) return failLogin(`login answered ${loginResponse.status}`);
    const login = LoginAnswerSchema.safeParse(await loginResponse.json());
    const sessionId = readSessionId(loginResponse);
    if (!login.success) return failLogin("login answer has an unexpected shape");
    if (!login.data.authenticated) return failLogin("credentials refused");
    if (!sessionId) return failLogin("no session cookie in the login answer");

    // The user id pins every later read answer to this account.
    const profileResponse = await fetch(`${env.NEWSBLUR_HOST}/social/load_user_profile`, {
      headers: sessionCookie(sessionId),
    });
    if (!profileResponse.ok) return failLogin(`profile answered ${profileResponse.status}`);
    const profile = ProfileAnswerSchema.safeParse(await profileResponse.json());
    if (!profile.success) return failLogin("profile answer has an unexpected shape");
    return { kind: "cookie", sessionId, userId: profile.data.user_profile.user_id };
  } catch (error) {
    return failLogin(String(error));
  }
};

const handleLogin = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const session = await logIn(env);
  if (!session) return signInFailedPage();
  const userKey = env.NEWSBLUR_USERNAME;
  const auth = userObject({ env, userKey });
  await auth.setSession(session);
  const previous = readLireSession(request);
  if (previous?.userKey === userKey) await auth.revokeToken(previous.token);
  const token = await auth.issueToken();
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Cache-Control": "no-store",
      "Set-Cookie": lireSetCookie({ value: `${userKey}.${token}` }),
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
  if (previous?.userKey === env.NEWSBLUR_USERNAME)
    await userObject({ env, userKey: previous.userKey }).revokeToken(previous.token);
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store", "Set-Cookie": lireSetCookie({ value: "", maxAge: 0 }) },
  });
};

const cookieUpstream =
  ({ env, sessionId }: { env: Env; sessionId: string }): NewsblurFetch =>
  async ({ method, path, query, form }) => {
    const url = new URL(path, env.NEWSBLUR_HOST);
    if (query) url.search = encodeParams(query).toString();
    const headers = sessionCookie(sessionId);
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
  if (!lire || lire.userKey !== env.NEWSBLUR_USERNAME) return signedOut();
  const auth = userObject({ env, userKey: lire.userKey });
  if (!(await auth.hasToken(lire.token))) return signedOut();

  let session = await auth.getSession();
  let loggedInNow = false;
  if (!session) {
    session = await logIn(env);
    if (!session) return signedOut();
    await auth.setSession(session);
    loggedInNow = true;
  }

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
      upstream: cookieUpstream({ env, sessionId: current.sessionId }),
      config: {
        userId: current.userId,
        geo: geoOf(request),
      },
      cache,
    });
  let result = await run(session);
  // NewsBlur rejected the session, or answered as another user: log in once more, then give up.
  // Only a GET retries, because a write may have partly landed before the rejection.
  let used = session;
  if (result.status === 401 && !loggedInNow && request.method === "GET") {
    const fresh = await logIn(env);
    if (fresh) {
      await auth.setSession(fresh);
      used = fresh;
      result = await run(fresh);
    }
  }
  if (result.status === 401) await auth.clearSession({ onlySessionId: used.sessionId });
  if (result.body === null)
    return new Response(null, { status: result.status, headers: { "Cache-Control": "no-store" } });
  return json({ body: result.body, status: result.status });
};

const route = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (pathname === LOGIN_PATH && request.method === "GET") return handleLogin({ request, env });
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
