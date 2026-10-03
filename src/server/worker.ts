import { z } from "zod";
import { handle, type FeedsCache } from "shared/bff/handle";
import { encodeParams, type NewsblurFetch } from "shared/bff/upstream";
import { matchRoute } from "shared/feedsApi/routes";
import { AccessError, verifyAccess } from "./access";
import type { Env } from "./env";
import type { StoredSession } from "./newsblurAuth";

export { NewsblurAuth } from "./newsblurAuth";

const LOGIN_PATH = "/api/auth/login";
const SESSION_COOKIE = "newsblur_sessionid";

const json = ({ body, status = 200 }: { body: unknown; status?: number }): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const newsblurAuth = (env: Env) => env.NEWSBLUR_AUTH.get(env.NEWSBLUR_AUTH.idFromName("singleton"));

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
    const match = new RegExp(`^${SESSION_COOKIE}=([^;]+)`).exec(line);
    if (match) return match[1];
  }
  return undefined;
};

// NewsBlur answers 403 "User agent banned: missing" to a request with no User-Agent, which is what a
// Worker sends by default.
const USER_AGENT = { "User-Agent": "Lire" };

const sessionCookie = (sessionId: string) => ({
  ...USER_AGENT,
  Cookie: `${SESSION_COOKIE}=${sessionId}`,
});

const failLogin = (reason: string): StoredSession | undefined => {
  console.warn(`NewsBlur login failed: ${reason}`);
  return undefined;
};

const logIn = async (env: Env): Promise<StoredSession | undefined> => {
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
    return { sessionId, userId: profile.data.user_profile.user_id };
  } catch (error) {
    return failLogin(String(error));
  }
};

const handleLogin = async ({ env }: { env: Env }): Promise<Response> => {
  const session = await logIn(env);
  if (!session) return signInFailedPage();
  await newsblurAuth(env).setSession(session);
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Cache-Control": "no-store" },
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
  let session = await auth.getSession();
  let loggedInNow = false;
  if (!session) {
    session = await logIn(env);
    if (!session) {
      if (match.route.path === "/api/auth/status") return json({ body: { signedIn: false } });
      return json({ body: { error: "sign_in_required" }, status: 401 });
    }
    await auth.setSession(session);
    loggedInNow = true;
  }

  const cache: FeedsCache = {
    get: async () => auth.getFeedsCache(),
    set: async (input) => auth.setFeedsCache(input),
    clear: async () => auth.clearFeedsCache(),
  };
  const run = async (current: StoredSession) =>
    handle({
      route: match.route,
      params: match.params,
      query: url.searchParams,
      body,
      upstream: cookieUpstream({ env, sessionId: current.sessionId }),
      config: { newsletterAddress: env.NEWSBLUR_NEWSLETTER_ADDRESS, userId: current.userId },
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
  if (result.body === null) return new Response(null, { status: result.status });
  return json({ body: result.body, status: result.status });
};

const route = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (pathname === LOGIN_PATH && request.method === "GET") return handleLogin({ env });
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
