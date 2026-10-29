// oxlint-disable typescript/await-thenable -- auth() is a Durable Object stub, whose RPC calls answer promises at runtime
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessError, verifyAccess } from "../access";
import type { NewsblurAuth } from "../newsblurAuth";

const ORIGIN = "https://lire.krebs.tech";
const OWNER = "owner@example.com";
const KID = "test-key";
const USER_ID = 42;
const SESSION_ID = "session-1";

let privateKey: CryptoKey;
let publicJwk: JWK;
let ownerJwt: string;

const signJwt = async ({
  email,
  key = privateKey,
  teamDomain = env.ACCESS_TEAM_DOMAIN,
}: {
  email: string;
  key?: CryptoKey;
  teamDomain?: string;
}) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(`https://${teamDomain}`)
    .setAudience(env.ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);

// The browser's copy of lire_session, which the helpers send unless a test calls anonymous.
let lireCookie: string | undefined;

const send = async (path: string, init: RequestInit, cookie: string | undefined) => {
  const headers = new Headers(init.headers);
  headers.set("Cf-Access-Jwt-Assertion", ownerJwt);
  if (cookie) headers.set("Cookie", cookie);
  return SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual", ...init, headers });
};

const authed = async (path: string, init: RequestInit = {}) => send(path, init, lireCookie);
const anonymous = async (path: string, init: RequestInit = {}) => send(path, init, undefined);

const cookieFrom = (response: Response) => response.headers.get("Set-Cookie")?.split(";")[0];

const storedTokenCount = async () =>
  runInDurableObject(
    auth(),
    (_instance, state) => (state.storage.kv.get<unknown[]>("tokens") ?? []).length,
  );

type Upstream = (request: Request) => Response | Promise<Response>;
// Bodies are read eagerly: a Request created inside the DO can't be read from the test's context.
type UpstreamCall = { url: string; method: string; headers: Headers; body: string };

let upstream: Upstream;
const upstreamCalls: UpstreamCall[] = [];

const objectFor = (userKey: string) =>
  env.NEWSBLUR_AUTH.get(env.NEWSBLUR_AUTH.idFromName(`user-id:${userKey}`));
const auth = () => objectFor(String(USER_ID));

const pathOf = (request: Request) => new URL(request.url).pathname;

const credential = {
  kind: "token",
  accessToken: SESSION_ID,
  refreshToken: "refresh-1",
  userId: USER_ID,
  username: "owner",
  revision: "session-1",
} as const;
const loginReply = (accessToken: string) =>
  Response.json({ access_token: accessToken, refresh_token: "refresh-1" });
const stateStart = async () => {
  const response = await authed("/api/auth/login");
  const state = new URL(response.headers.get("Location")!).searchParams.get("state")!;
  return { state, cookie: response.headers.getSetCookie()[0].split(";")[0] };
};
const callback = async ({
  state,
  cookie,
  code = "code-1",
}: {
  state: string;
  cookie?: string;
  code?: string;
}) =>
  send(
    `/api/auth/callback?state=${state}&code=${code}`,
    {},
    [cookie, lireCookie].filter(Boolean).join("; "),
  );
const login = async () => {
  const response = await callback(await stateStart());
  lireCookie =
    response.headers
      .getSetCookie()
      .find((line) => line.startsWith("lire_session="))
      ?.split(";")[0] ?? lireCookie;
  return response;
};
const expectCallbackFailure = (response: Response, cause: string) => {
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(`/?signin=${cause}`);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.getSetCookie()[0]).toContain("Max-Age=0");
  expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("lire_session="))).toBe(
    false,
  );
};
const signInUpstream =
  ({
    userId = USER_ID,
    sessionId = SESSION_ID,
  }: { userId?: number; sessionId?: string } = {}): Upstream =>
  (request) => {
    if (pathOf(request) === "/oauth/token") return loginReply(sessionId);
    return Response.json({
      user_profile: { user_id: userId, username: "owner" },
      authenticated: true,
      user_id: userId,
    });
  };

const status = async () => (await authed("/api/auth/status")).json();

const signIn = async () => {
  upstream = signInUpstream();
  const response = await login();
  expect(response.status).toBe(302);
  upstreamCalls.length = 0;
};

const session = { authenticated: true, user_id: USER_ID };
const feedsAnswer = {
  ...session,
  feeds: { "1": { id: 1, feed_title: "One", feed_address: "https://one.example/feed" } },
  folders: [{ Tech: [1] }],
};

// One key pair per isolate, since jose caches the key set it fetches.
let keysReady: Promise<void> | undefined;
const generateKeys = async () => {
  const keys = await generateKeyPair("RS256");
  privateKey = keys.privateKey;
  publicJwk = { ...(await exportJWK(keys.publicKey)), kid: KID };
  ownerJwt = await signJwt({ email: OWNER });
};

const setup = async () => {
  keysReady ??= generateKeys();
  await keysReady;
  await auth().clearSession();
  await runInDurableObject(auth(), (_instance, state) => state.storage.kv.delete("onboarding"));
  await runInDurableObject(auth(), (_instance, state) => state.storage.kv.delete("tokens"));
  lireCookie = `lire_session=${String(USER_ID)}.${await auth().issueToken()}`;
  upstreamCalls.length = 0;
  upstream = () => new Response("unexpected upstream call", { status: 599 });
  // The main worker and its DO share the test isolate, so a global fetch stub reaches both.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const { url, method, headers } = request;
    // jose caches the key set per isolate, so certs calls stay out of upstreamCalls.
    if (/^https:\/\/[^/]+\/cdn-cgi\/access\/certs$/.test(url)) {
      return Response.json({ keys: [publicJwk] });
    }
    upstreamCalls.push({
      url,
      method,
      headers,
      body: new TextDecoder().decode(await request.clone().arrayBuffer()),
    });
    return upstream(request);
  });
};

describe("worker", () => {
  // The server project has no setup file, so the fetch stub is undone here.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("when the request path is not under /api", () => {
    it("returns 404 for unknown routes", async () => {
      await setup();
      const response = await SELF.fetch("http://example.com/");
      expect(response.status).toBe(404);
    });
  });

  describe("when the Access gate checks a request", () => {
    it("rejects a request without a Cf-Access-Jwt-Assertion header", async () => {
      await setup();
      const response = await SELF.fetch(`${ORIGIN}/api/auth/status`);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden" });
    });

    it("rejects a malformed token", async () => {
      await setup();
      const response = await SELF.fetch(`${ORIGIN}/api/auth/status`, {
        headers: { "Cf-Access-Jwt-Assertion": "not-a-jwt" },
      });
      expect(response.status).toBe(403);
    });

    it("rejects a token signed by an unknown key", async () => {
      await setup();
      const stranger = await generateKeyPair("RS256");
      const response = await SELF.fetch(`${ORIGIN}/api/auth/status`, {
        headers: {
          "Cf-Access-Jwt-Assertion": await signJwt({ email: OWNER, key: stranger.privateKey }),
        },
      });
      expect(response.status).toBe(403);
    });

    it("rejects a valid token for another email", async () => {
      await setup();
      const response = await SELF.fetch(`${ORIGIN}/api/auth/status`, {
        headers: { "Cf-Access-Jwt-Assertion": await signJwt({ email: "intruder@example.com" }) },
      });
      expect(response.status).toBe(403);
    });

    it("guards the sign-in routes too", async () => {
      await setup();
      const response = await SELF.fetch(`${ORIGIN}/api/auth/login`, { redirect: "manual" });
      expect(response.status).toBe(403);
    });

    it("admits a valid token for the owner", async () => {
      await setup();
      const response = await authed("/api/auth/status");
      expect(response.status).toBe(200);
    });
  });

  describe("when using OAuth", () => {
    it("redirects to authorize and exchanges the code for a user id credential", async () => {
      await setup();
      upstream = signInUpstream();
      const start = await authed("/api/auth/login");
      const url = new URL(start.headers.get("Location")!);
      expect(url.origin + url.pathname).toBe(`${env.NEWSBLUR_HOST}/oauth/authorize`);
      expect(url.searchParams.get("client_id")).toBe(env.NEWSBLUR_OAUTH_CLIENT_ID);
      expect(url.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback`);
      expect(start.headers.get("Set-Cookie")).toContain(
        "HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600",
      );
      const response = await callback({
        state: url.searchParams.get("state")!,
        cookie: cookieFrom(start),
      });
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");
      expect(response.headers.getSetCookie()[1]).toMatch(/^lire_session=42\./);
      expect(Object.fromEntries(new URLSearchParams(upstreamCalls[0].body))).toEqual({
        grant_type: "authorization_code",
        code: "code-1",
        client_id: env.NEWSBLUR_OAUTH_CLIENT_ID,
        client_secret: env.NEWSBLUR_OAUTH_CLIENT_SECRET,
        redirect_uri: `${ORIGIN}/api/auth/callback`,
      });
      expect(upstreamCalls[1].headers.get("Authorization")).toBe(`Bearer ${SESSION_ID}`);
      expect(upstreamCalls[1].headers.get("Cookie")).toBeNull();
      const stored = await auth().getSession();
      expect(stored?.revision).toEqual(expect.any(String));
      expect(stored).toMatchObject({
        kind: "token",
        accessToken: SESSION_ID,
        refreshToken: "refresh-1",
        userId: USER_ID,
        username: "owner",
      });
    });

    it.each(["missing", "mismatched", "expired", "replayed"])("rejects %s state", async (kind) => {
      await setup();
      upstream = signInUpstream();
      const start = await stateStart();
      if (kind === "expired") {
        const stub = env.NEWSBLUR_AUTH.get(env.NEWSBLUR_AUTH.idFromName(`oauth:${start.state}`));
        await runInDurableObject(stub, (_instance, state) => {
          state.storage.kv.put("state", Date.now() - 1);
        });
      }
      if (kind === "replayed") await callback(start);
      upstreamCalls.length = 0;
      const response = await callback({
        ...start,
        cookie:
          kind === "missing"
            ? undefined
            : kind === "mismatched"
              ? "lire_oauth_state=other"
              : start.cookie,
      });
      expectCallbackFailure(response, "expired");
      expect(upstreamCalls).toHaveLength(0);
    });

    it.each([
      { suffix: "", cause: "failed" },
      { suffix: "&code=x&error=access_denied", cause: "denied" },
    ])("redirects an authorization failure to signin=$cause", async ({ suffix, cause }) => {
      await setup();
      const start = await stateStart();
      const response = await send(
        `/api/auth/callback?state=${start.state}${suffix}`,
        {},
        start.cookie,
      );
      expectCallbackFailure(response, cause);
      expect(upstreamCalls).toHaveLength(0);
    });

    it("rejects a callback with no state parameter", async () => {
      await setup();
      expectCallbackFailure(await anonymous("/api/auth/callback?code=x"), "expired");
      expect(upstreamCalls).toHaveLength(0);
    });

    it.each([
      "token error",
      "token shape",
      "token json",
      "profile error",
      "profile shape",
      "network",
      "thrown string",
    ])("fails closed on %s", async (failure) => {
      await setup();
      upstream = async (request) => {
        if (failure === "network") throw new Error("offline");
        if (failure === "thrown string") throw "offline";
        const token = pathOf(request) === "/oauth/token";
        if ((failure === "token error" && token) || (failure === "profile error" && !token))
          return new Response(null, { status: 500 });
        if ((failure === "token shape" && token) || (failure === "profile shape" && !token))
          return Response.json({});
        if (failure === "token json" && token) return new Response("bad json");
        return signInUpstream()(request);
      };
      expectCallbackFailure(await login(), "failed");
      expect(await auth().hasSession()).toBe(false);
    });

    it("logs the failed step and status, never the code", async () => {
      await setup();
      upstream = () => new Response(null, { status: 502 });
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      expectCallbackFailure(await login(), "failed");
      expect(logged).toHaveBeenCalledWith("oauth callback failed", { step: "token", status: 502 });
      expect(JSON.stringify(logged.mock.calls)).not.toContain("code-1");
      logged.mockRestore();
    });

    it("replaces the browser token on repeated login", async () => {
      await setup();
      upstream = signInUpstream();
      const previous = lireCookie;
      await login();
      await login();
      expect(await storedTokenCount()).toBe(1);
      expect(await (await send("/api/auth/status", {}, previous)).json()).toEqual({
        signedIn: false,
      });
    });

    it("isolates two users by id across Worker requests and logout", async () => {
      await setup();
      await signIn();
      const first = lireCookie;
      upstream = signInUpstream({ userId: 7, sessionId: "other-access" });
      await login();
      const second = lireCookie;
      upstreamCalls.length = 0;
      upstream = (request) => {
        const other = request.headers.get("Authorization") === "Bearer other-access";
        return Response.json({
          authenticated: true,
          user_id: other ? 7 : 42,
          user_profile: { username: other ? "other" : "owner" },
        });
      };
      expect(await (await send("/api/profile", {}, first)).json()).toEqual({ username: "owner" });
      expect(await (await send("/api/profile", {}, second)).json()).toEqual({ username: "other" });
      expect(upstreamCalls.map((call) => call.headers.get("Authorization"))).toEqual([
        `Bearer ${SESSION_ID}`,
        "Bearer other-access",
      ]);
      for (const call of upstreamCalls) expect(call.headers.get("Cookie")).toBeNull();
      await send(
        "/api/auth/logout",
        { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" } },
        second,
      );
      expect(await (await send("/api/auth/status", {}, first)).json()).toEqual({
        signedIn: true,
        userId: 42,
      });
      expect(await (await send("/api/auth/status", {}, second)).json()).toEqual({
        signedIn: false,
      });
    });

    it("does not expose a session when credential storage partly fails", async () => {
      await setup();
      upstream = signInUpstream();
      await runInDurableObject(auth(), async (_instance, state) => {
        const put = state.storage.kv.put.bind(state.storage.kv);
        const spy = vi.spyOn(state.storage.kv, "put").mockImplementation((key, value) => {
          if (key === "tokens") throw new Error("disk full");
          put(key, value);
        });
        try {
          expectCallbackFailure(await login(), "failed");
          expect(await auth().hasSession()).toBe(false);
          expect(await storedTokenCount()).toBe(1);
        } finally {
          spy.mockRestore();
        }
      });
    });

    it("keeps the credential and returns 429 when refresh is rate limited", async () => {
      await setup();
      await signIn();
      upstream = (request) =>
        new Response(null, { status: pathOf(request) === "/oauth/token" ? 429 : 401 });
      const response = await authed("/api/profile");
      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({ error: "rate_limited", retryAfter: 60 });
      expect(await auth().hasSession()).toBe(true);
    });

    it("invalidates legacy username cookies", async () => {
      await setup();
      expect((await send("/api/profile", {}, "lire_session=owner.old")).status).toBe(401);
    });
  });

  describe("when serving a contract route", () => {
    const sameOrigin = { Origin: ORIGIN };
    const sameOriginJson = { Origin: ORIGIN, "Content-Type": "application/json" };

    it("answers 401 sign_in_required when no credential is stored", async () => {
      await setup();
      const response = await authed("/api/profile");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "sign_in_required" });
      expect(upstreamCalls.map((call) => new URL(call.url).pathname)).toEqual([]);
    });

    it("calls NewsBlur with a Bearer token and answers the contract shape", async () => {
      await setup();
      await signIn();
      upstream = () =>
        Response.json(
          { ...session, user_profile: { username: "owner" } },
          { headers: { "Set-Cookie": "session=upstream" } },
        );

      const response = await authed("/api/profile");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ username: "owner" });
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(response.headers.get("Cache-Control")).toBe("no-store");

      const [call] = upstreamCalls;
      expect(call.url).toBe(`${env.NEWSBLUR_HOST}/social/load_user_profile`);
      expect(call.method).toBe("GET");
      expect(call.headers.get("Authorization")).toBe(`Bearer ${SESSION_ID}`);
    });

    it("sends query params and form bodies, and caches the feed list until a write", async () => {
      await setup();
      await signIn();
      upstream = (request) => {
        const path = pathOf(request);
        if (path === "/reader/feeds") return Response.json(feedsAnswer);
        if (path === "/profile/get_preference") return Response.json({ code: 1, payload: {} });
        return Response.json({ code: 1 });
      };

      const response = await authed("/api/categories/Tech", {
        method: "PATCH",
        headers: { ...sameOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Science" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: "Science", label: "Science", feedIds: ["1"] });

      const [feeds, rename] = upstreamCalls;
      expect(feeds.url).toBe(
        `${env.NEWSBLUR_HOST}/reader/feeds?flat=false&include_favicons=false&update_counts=false`,
      );
      expect(rename.method).toBe("POST");
      expect(rename.headers.get("Content-Type")).toContain("application/x-www-form-urlencoded");
      expect(Object.fromEntries(new URLSearchParams(rename.body))).toEqual({
        folder_to_rename: "Tech",
        new_folder_name: "Science",
        in_folder: "",
      });
      expect((await auth().getFeedsCache()).value).toBeUndefined();
    });

    it("derives the newsletter address from the profile and the feeds token", async () => {
      await setup();
      await signIn();
      upstream = (request) => {
        const path = pathOf(request);
        if (path === "/reader/feeds")
          return Response.json({ ...feedsAnswer, share_ext_token: "tok123" });
        if (path === "/social/load_user_profile") {
          return Response.json({ ...session, user_profile: { username: "owner" } });
        }
        return Response.json({ code: 1 });
      };

      const response = await authed("/api/newsletter-address");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        emailAddress: "owner-tok123@newsletters.newsblur.com",
      });
    });

    it("answers 204 with no body for a same-origin DELETE without a Content-Type", async () => {
      await setup();
      await signIn();
      upstream = (request) =>
        pathOf(request) === "/reader/feeds"
          ? Response.json(feedsAnswer)
          : Response.json({ code: 1 });

      const response = await authed("/api/feeds/1", { method: "DELETE", headers: sameOrigin });
      expect(response.status).toBe(204);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).toBe("");
      expect(upstreamCalls.map((call) => pathOf(new Request(call.url)))).toEqual([
        "/reader/feeds",
        "/reader/delete_feed",
      ]);
    });

    it("refreshes once when NewsBlur rejects the access token", async () => {
      await setup();
      await signIn();
      upstream = async (request) => {
        if (pathOf(request) === "/oauth/token") return loginReply("session-2");
        if (request.headers.get("Authorization") === "Bearer session-2") {
          return signInUpstream()(request);
        }
        return new Response("unauthorized", { status: 401 });
      };

      const response = await authed("/api/profile");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ username: "owner" });
      expect((await auth().getSession())?.accessToken).toBe("session-2");
      const refresh = upstreamCalls.find((call) => new URL(call.url).pathname === "/oauth/token");
      expect(Object.fromEntries(new URLSearchParams(refresh?.body))).toEqual({
        grant_type: "refresh_token",
        refresh_token: "refresh-1",
        client_id: env.NEWSBLUR_OAUTH_CLIENT_ID,
        client_secret: env.NEWSBLUR_OAUTH_CLIENT_SECRET,
      });
      for (const call of upstreamCalls) {
        expect(call.headers.get("Cookie")).toBeNull();
        expect(call.headers.get("User-Agent")).toBe("Lire");
      }
    });

    it("does not retry a write when NewsBlur rejects the session", async () => {
      await setup();
      await signIn();
      upstream = () => new Response("unauthorized", { status: 401 });

      const response = await authed("/api/preferences", {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ "lire.categoryOrder": "[]" }),
      });
      expect(response.status).toBe(401);
      await response.text();
      expect(
        upstreamCalls.filter((call) => new URL(call.url).pathname === "/oauth/token"),
      ).toHaveLength(0);
      expect(await auth().hasSession()).toBe(false);
    });

    it("refreshes only once when the new access token is also rejected", async () => {
      await setup();
      await signIn();
      upstream = async (request) => {
        const path = pathOf(request);
        if (path === "/oauth/token") return loginReply(SESSION_ID);
        if (path === "/social/load_user_profile") return signInUpstream()(request);
        return new Response("unauthorized", { status: 401 });
      };

      const response = await authed("/api/categories");
      expect(response.status).toBe(401);
      await response.text();
      expect(
        upstreamCalls.filter((call) => new URL(call.url).pathname === "/oauth/token"),
      ).toHaveLength(1);
      expect(await auth().hasSession()).toBe(false);
    });

    it("clears the credential when NewsBlur rejects it and the refresh grant is invalid", async () => {
      await setup();
      await signIn();
      await auth().patchOnboarding({ done: { newsletter: true }, dismissed: true });
      upstream = (request) =>
        pathOf(request) === "/oauth/token"
          ? Response.json({ error: "invalid_grant" }, { status: 400 })
          : new Response("unauthorized", { status: 401 });

      const response = await authed("/api/profile");
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: "sign_in_required" });
      expect(await auth().hasSession()).toBe(false);
      expect(await auth().getOnboarding()).toEqual({
        done: { newsletter: true },
        collapsed: false,
        dismissed: true,
      });
      expect(await status()).toEqual({ signedIn: false });
    });

    it("keeps the credential and answers 502 when refresh fails transiently", async () => {
      await setup();
      await signIn();
      upstream = (request) =>
        pathOf(request) === "/oauth/token"
          ? new Response("down", { status: 503 })
          : new Response("unauthorized", { status: 401 });

      const response = await authed("/api/profile");
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "upstream_error" });
      expect(await auth().hasSession()).toBe(true);
      expect(await status()).toMatchObject({ signedIn: true });
    });

    it("clears the session when NewsBlur answers as another user", async () => {
      await setup();
      await signIn();
      upstream = (request) =>
        pathOf(request) === "/oauth/token"
          ? Response.json({ error: "invalid_grant" }, { status: 400 })
          : Response.json({ authenticated: true, user_id: 7, user_profile: { username: "demo" } });

      const response = await authed("/api/profile");
      expect(response.status).toBe(401);
      await response.text();
      expect(await auth().hasSession()).toBe(false);
    });

    it("keeps the session on a non-auth failure", async () => {
      await setup();
      await signIn();
      upstream = () => new Response("down", { status: 500 });

      const response = await authed("/api/profile");
      expect(response.status).toBe(502);
      await response.text();
      expect(await auth().hasSession()).toBe(true);
    });

    it("answers 409 user_mismatch for marks of another user and keeps the session", async () => {
      await setup();
      await signIn();

      const response = await authed("/api/entries/mark", {
        method: "POST",
        headers: { ...sameOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: 7, read: ["1:a"] }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "user_mismatch",
        message: "The marks belong to another user.",
      });
      expect(upstreamCalls.filter((call) => call.method === "POST")).toEqual([]);
      expect(await auth().hasSession()).toBe(true);
      expect(await status()).toMatchObject({ signedIn: true });
    });

    it("returns 404 for an unknown /api/ path without calling upstream", async () => {
      await setup();
      await signIn();
      const response = await authed("/api/v3/profile");
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
      expect(upstreamCalls).toHaveLength(0);
    });

    describe("when /api/sun reads the Cloudflare position", () => {
      // UTC has no table entry, so only a usable cf position can answer it.
      const sunWith = async (cf: Record<string, string>) => {
        await setup();
        await signIn();
        const response = await authed("/api/sun?tz=UTC", { cf });
        await response.text();
        return response.status;
      };
      const position = { latitude: "48.85", longitude: "2.35", timezone: "UTC" };

      it("uses it when latitude, longitude and time zone are present", async () => {
        expect(await sunWith(position)).toBe(200);
      });

      it.for(["latitude", "longitude", "timezone"])(
        "ignores it when %s is missing",
        async (key) => {
          expect(await sunWith({ ...position, [key]: "" })).toBe(404);
        },
      );

      it.for(["latitude", "longitude"])("ignores it when %s is not a number", async (key) => {
        expect(await sunWith({ ...position, [key]: "north" })).toBe(404);
      });
    });

    it("returns 404 for a known path with the wrong method", async () => {
      await setup();
      const response = await authed("/api/auth/login", { method: "POST", headers: sameOrigin });
      expect(response.status).toBe(404);
      await response.text();
    });

    it("rejects a cross-origin POST without calling upstream", async () => {
      await setup();
      await signIn();
      const response = await authed("/api/preferences", {
        method: "POST",
        headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
        body: JSON.stringify({ "lire.categoryOrder": "[]" }),
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden" });
      expect(upstreamCalls).toHaveLength(0);
    });

    it("rejects a same-origin POST that is not JSON", async () => {
      await setup();
      await signIn();
      const response = await authed("/api/preferences", {
        method: "POST",
        headers: { ...sameOrigin, "Content-Type": "text/plain" },
        body: "{}",
      });
      expect(response.status).toBe(403);
      await response.text();
      expect(upstreamCalls).toHaveLength(0);
    });

    it("answers 400 for a malformed JSON body", async () => {
      await setup();
      await signIn();
      const response = await authed("/api/preferences", {
        method: "POST",
        headers: { ...sameOrigin, "Content-Type": "application/json" },
        body: "{",
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "bad_request" });
      expect(upstreamCalls).toHaveLength(0);
    });

    it("answers 400 and calls nothing upstream for a ban sequence", async () => {
      await setup();
      await signIn();
      const response = await authed("/api/preferences", {
        method: "POST",
        headers: { ...sameOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ "lire.categoryOrder": "../../../etc" }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "bad_request" });
      expect(upstreamCalls).toHaveLength(0);
    });

    it("accepts a same-origin Referer when Origin is absent", async () => {
      await setup();
      await signIn();
      upstream = () => Response.json({ code: 1 });
      const response = await authed("/api/preferences", {
        method: "POST",
        headers: { Referer: `${ORIGIN}/settings`, "Content-Type": "application/json" },
        body: JSON.stringify({ "lire.categoryOrder": "[]" }),
      });
      expect(response.status).toBe(204);
      expect(new URLSearchParams(upstreamCalls[0].body).get("lire.categoryOrder")).toBe('"[]"');
    });

    it("reads default onboarding state and merges ticks atomically", async () => {
      await setup();
      await signIn();
      expect(await (await authed("/api/onboarding")).json()).toEqual({
        done: {},
        collapsed: false,
        dismissed: false,
      });
      const patches = [{ done: { addFeed: true } }, { done: { language: true }, collapsed: true }];
      const responses = await Promise.all(
        patches.map(async (patch) =>
          authed("/api/onboarding", {
            method: "PATCH",
            headers: sameOriginJson,
            body: JSON.stringify(patch),
          }),
        ),
      );
      for (const response of responses) expect(response.status).toBe(200);
      expect(await (await authed("/api/onboarding")).json()).toEqual({
        done: { addFeed: true, language: true },
        collapsed: true,
        dismissed: false,
      });
      const untick = await authed("/api/onboarding", {
        method: "PATCH",
        headers: sameOriginJson,
        body: JSON.stringify({ done: { addFeed: false }, dismissed: true }),
      });
      expect(await untick.json()).toEqual({
        done: { language: true },
        collapsed: true,
        dismissed: true,
      });
      expect(upstreamCalls).toHaveLength(0);
    });

    it("rejects onboarding patches that fail CSRF, auth, or JSON checks", async () => {
      await setup();
      await signIn();
      const crossOrigin = await authed("/api/onboarding", {
        method: "PATCH",
        headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
        body: JSON.stringify({ collapsed: true }),
      });
      expect(crossOrigin.status).toBe(403);
      const malformed = await authed("/api/onboarding", {
        method: "PATCH",
        headers: sameOriginJson,
        body: "{",
      });
      expect(malformed.status).toBe(400);
      const unauthenticated = await anonymous("/api/onboarding");
      expect(unauthenticated.status).toBe(401);
      expect(upstreamCalls).toHaveLength(0);
    });

    it("returns 400 for an onboarding patch with invalid state", async () => {
      await setup();
      await signIn();
      const response = await authed("/api/onboarding", {
        method: "PATCH",
        headers: sameOriginJson,
        body: JSON.stringify({ done: { install: true } }),
      });
      expect(response.status).toBe(400);
    });

    it.each([
      ["neither Origin nor Referer", {}],
      ["an unparseable Referer", { Referer: "not a url" }],
    ])("rejects a DELETE with %s", async (_label, headers) => {
      await setup();
      const response = await authed("/api/feeds/1", { method: "DELETE", headers });
      expect(response.status).toBe(403);
      await response.text();
    });
  });

  describe("when the browser's lire_session cookie is checked", () => {
    it("answers 401 and calls nothing upstream with no cookie", async () => {
      await setup();
      const response = await anonymous("/api/profile");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "sign_in_required" });
      expect(upstreamCalls).toHaveLength(0);
    });

    it("answers signedIn false with no cookie", async () => {
      await setup();
      const response = await anonymous("/api/auth/status");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ signedIn: false });
      expect(upstreamCalls).toHaveLength(0);
    });

    it.each([
      ["no dot", "owner"],
      ["an empty token", "owner."],
      ["an empty user key", ".token"],
    ])("rejects a cookie with %s", async (_label, value) => {
      await setup();
      const response = await send("/api/profile", {}, `lire_session=${value}`);
      expect(response.status).toBe(401);
      await response.text();
      expect(upstreamCalls).toHaveLength(0);
    });

    it("rejects a token that was never issued", async () => {
      await setup();
      const response = await send("/api/profile", {}, "lire_session=42.never-issued");
      expect(response.status).toBe(401);
      await response.text();
      expect(upstreamCalls).toHaveLength(0);
    });

    it("rejects a token past its expiry", async () => {
      await setup();
      await runInDurableObject(auth(), (_instance, state) => {
        const stored = state.storage.kv.get<{ hash: string; expiresAt: number }[]>("tokens") ?? [];
        state.storage.kv.put(
          "tokens",
          stored.map((token) => ({ ...token, expiresAt: Date.now() - 1 })),
        );
      });
      const response = await authed("/api/profile");
      expect(response.status).toBe(401);
      await response.text();
      expect(upstreamCalls).toHaveLength(0);
    });

    it("rejects a cookie for another user key, creating no session", async () => {
      await setup();
      const token = lireCookie?.split(".").pop();
      const response = await send("/api/profile", {}, `lire_session=999.${token}`);
      expect(response.status).toBe(401);
      await response.text();
      expect(upstreamCalls).toHaveLength(0);
      expect(await objectFor("999").hasSession()).toBe(false);
    });
  });

  describe("when the owner signs out", () => {
    const sameOriginJson = { Origin: ORIGIN, "Content-Type": "application/json" };
    const CLEARED_COOKIE = "lire_session=; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=0";

    it("revokes the presented token, clears the cookie and keeps the NewsBlur session", async () => {
      await setup();
      await signIn();
      const response = await authed("/api/auth/logout", {
        method: "POST",
        headers: sameOriginJson,
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Set-Cookie")).toBe(CLEARED_COOKIE);
      expect(await response.text()).toBe("");
      expect(upstreamCalls).toHaveLength(0);
      expect(await storedTokenCount()).toBe(0);
      expect(await auth().hasSession()).toBe(true);
      expect(await status()).toEqual({ signedIn: false });
    });

    it("answers 204 with no cookie and leaves the owner's token alone", async () => {
      await setup();
      await signIn();
      const response = await anonymous("/api/auth/logout", {
        method: "POST",
        headers: sameOriginJson,
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("Set-Cookie")).toBe(CLEARED_COOKIE);
      expect(upstreamCalls).toHaveLength(0);
      expect(await status()).toEqual({ signedIn: true, userId: USER_ID });
    });

    it("leaves another user key's token alone", async () => {
      await setup();
      await signIn();
      const token = lireCookie?.split(".").pop();
      const response = await send(
        "/api/auth/logout",
        { method: "POST", headers: sameOriginJson },
        `lire_session=999.${token}`,
      );
      expect(response.status).toBe(204);
      expect(await status()).toEqual({ signedIn: true, userId: USER_ID });
    });

    it.each([
      [
        "a cross-origin request",
        { Origin: "https://evil.example", "Content-Type": "application/json" },
      ],
      ["a same-origin request that is not JSON", { Origin: ORIGIN, "Content-Type": "text/plain" }],
      ["a same-origin request with no Content-Type", { Origin: ORIGIN }],
    ])("rejects %s before revoking anything", async (_label, headers) => {
      await setup();
      await signIn();
      const response = await authed("/api/auth/logout", { method: "POST", headers });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden" });
      expect(await status()).toEqual({ signedIn: true, userId: USER_ID });
    });
  });

  describe("when the NewsblurAuth feed cache is read", () => {
    it("serves a fresh entry and drops it on a session change", async () => {
      await setup();
      const { generation } = await auth().getFeedsCache();
      await auth().setFeedsCache({ value: feedsAnswer, generation });
      expect((await auth().getFeedsCache()).value).toEqual(feedsAnswer);
      await auth().setSession({ ...credential, accessToken: "session-2", revision: "session-2" });
      expect((await auth().getFeedsCache()).value).toBeUndefined();
    });

    it("ignores a set from before the last clear", async () => {
      await setup();
      const { generation } = await auth().getFeedsCache();
      await auth().clearFeedsCache();
      await auth().setFeedsCache({ value: feedsAnswer, generation });
      const after = await auth().getFeedsCache();
      expect(after.value).toBeUndefined();
      expect(after.generation).toBe(generation + 1);
    });

    it("clears a session only when it is still the one that failed", async () => {
      await setup();
      await auth().setSession({ ...credential, accessToken: "session-2", revision: "session-2" });
      await auth().clearSession({ onlyRevision: "session-1" });
      expect(await auth().hasSession()).toBe(true);
      await auth().clearSession({ onlyRevision: "session-2" });
      expect(await auth().hasSession()).toBe(false);
    });

    it("drops an entry older than five minutes", async () => {
      await setup();
      await runInDurableObject(auth(), (instance: NewsblurAuth, state) => {
        instance.setFeedsCache({
          value: feedsAnswer,
          generation: instance.getFeedsCache().generation,
        });
        state.storage.kv.put("feedsCache", { value: feedsAnswer, expiresAt: Date.now() - 1 });
        expect(instance.getFeedsCache().value).toBeUndefined();
      });
    });
  });

  describe("when verifyAccess is called directly", () => {
    const accessEnv = ({
      teamDomain = "other-team.cloudflareaccess.com",
      aud = env.ACCESS_AUD,
      allowedEmail = "",
    }: {
      teamDomain?: string;
      aud?: string;
      allowedEmail?: string;
    } = {}) => ({
      ACCESS_TEAM_DOMAIN: teamDomain,
      ACCESS_AUD: aud,
      ACCESS_ALLOWED_EMAIL: allowedEmail,
    });

    const requestWith = (token: string) =>
      new Request(`${ORIGIN}/api/auth/status`, { headers: { "Cf-Access-Jwt-Assertion": token } });

    it("fails closed without a team domain", async () => {
      await setup();
      await expect(
        verifyAccess({ request: requestWith(ownerJwt), env: accessEnv({ teamDomain: "" }) }),
      ).rejects.toMatchObject({ code: "misconfigured" });
    });

    it("fails closed without an audience", async () => {
      await setup();
      await expect(
        verifyAccess({ request: requestWith(ownerJwt), env: accessEnv({ aud: "" }) }),
      ).rejects.toBeInstanceOf(AccessError);
    });

    it("admits any email when no owner is pinned", async () => {
      await setup();
      const teamDomain = "unpinned-team.cloudflareaccess.com";
      const token = await signJwt({ email: "anyone@example.com", teamDomain });
      const payload = await verifyAccess({
        request: requestWith(token),
        env: accessEnv({ teamDomain }),
      });
      expect(payload.email).toBe("anyone@example.com");
    });
  });
});
