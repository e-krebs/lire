// oxlint-disable typescript/no-deprecated -- SELF is the vitest-pool-workers integration Fetcher;
// the suggested exports.default.fetch() has a different signature/dispatch, not a drop-in.
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessError, verifyAccess } from "../access";
import type { NewsblurAuth } from "../newsblurAuth";

const ORIGIN = "https://lire.krebs.tech";
const OWNER = "owner@example.com";
const KID = "test-key";
const USER_ID = 42;
const CALLBACK_URI = `${ORIGIN}/api/auth/callback`;

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

const authed = async (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("Cf-Access-Jwt-Assertion", ownerJwt);
  return SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual", ...init, headers });
};

type Upstream = (request: Request) => Response | Promise<Response>;
// Bodies are read eagerly: a Request created inside the DO can't be read from the test's context.
type UpstreamCall = { url: string; method: string; headers: Headers; body: string };

let upstream: Upstream;
const upstreamCalls: UpstreamCall[] = [];

const auth = () => env.NEWSBLUR_AUTH.get(env.NEWSBLUR_AUTH.idFromName("singleton"));

const pathOf = (request: Request) => new URL(request.url).pathname;

// The answers a successful sign-in reads: the code exchange, then the profile that names the user.
const signInUpstream =
  ({ userId = USER_ID }: { userId?: number } = {}): Upstream =>
  (request) => {
    if (pathOf(request) === "/oauth/token") return Response.json({ access_token: "access-1" });
    return Response.json({
      user_profile: { user_id: userId, username: "owner" },
      authenticated: true,
      user_id: userId,
    });
  };

const startLogin = async () => {
  const response = await authed("/api/auth/login");
  const state = /lire_oauth_state=([0-9a-f]+)/.exec(response.headers.get("Set-Cookie") ?? "")?.[1];
  if (!state) throw new Error("login set no state cookie");
  return { response, state };
};

const callback = async ({
  code = "code-1",
  state,
  cookie = state,
}: {
  code?: string;
  state?: string;
  cookie?: string;
}) => {
  const query = new URLSearchParams();
  if (code) query.set("code", code);
  if (state) query.set("state", state);
  return authed(`/api/auth/callback?${query.toString()}`, {
    headers: cookie ? { Cookie: `other=1; lire_oauth_state=${cookie}` } : {},
  });
};

const status = async () => (await authed("/api/auth/status")).json();

const signIn = async () => {
  upstream = signInUpstream();
  const { state } = await startLogin();
  const response = await callback({ state });
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
  await auth().clearToken();
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

  describe("when the owner signs in", () => {
    it("redirects to the NewsBlur authorize page with a state cookie", async () => {
      await setup();
      const { response, state } = await startLogin();
      expect(response.status).toBe(302);
      expect(response.headers.get("Cache-Control")).toBe("no-store");

      const location = new URL(response.headers.get("Location") ?? "");
      expect(`${location.origin}${location.pathname}`).toBe(`${env.NEWSBLUR_HOST}/oauth/authorize`);
      expect(Object.fromEntries(location.searchParams)).toEqual({
        response_type: "code",
        client_id: env.NEWSBLUR_CLIENT_ID,
        redirect_uri: CALLBACK_URI,
        scope: "read write",
        state,
      });
      expect(response.headers.get("Set-Cookie")).toBe(
        `lire_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`,
      );
      expect(upstreamCalls).toHaveLength(0);
    });

    it("exchanges the code, stores the token and user, and reports signedIn", async () => {
      await setup();
      upstream = signInUpstream();
      expect(await status()).toEqual({ signedIn: false });

      const { state } = await startLogin();
      const response = await callback({ state });
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");
      expect(response.headers.get("Set-Cookie")).toContain("lire_oauth_state=;");
      expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");

      const [exchange, profile] = upstreamCalls;
      expect(exchange.url).toBe(`${env.NEWSBLUR_HOST}/oauth/token`);
      expect(exchange.method).toBe("POST");
      expect(Object.fromEntries(new URLSearchParams(exchange.body))).toEqual({
        grant_type: "authorization_code",
        code: "code-1",
        redirect_uri: CALLBACK_URI,
        client_id: env.NEWSBLUR_CLIENT_ID,
        client_secret: env.NEWSBLUR_CLIENT_SECRET,
      });
      expect(profile.url).toBe(`${env.NEWSBLUR_HOST}/social/load_user_profile`);
      expect(profile.headers.get("Authorization")).toBe("Bearer access-1");

      expect(await auth().getToken()).toEqual({ accessToken: "access-1", userId: USER_ID });
      expect(await status()).toEqual({ signedIn: true });
    });

    it("rejects a state that does not match the cookie", async () => {
      await setup();
      upstream = signInUpstream();
      const { state } = await startLogin();
      const response = await callback({ state, cookie: `${state.slice(1)}0` });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain('href="/api/auth/login"');
      expect(upstreamCalls).toHaveLength(0);
      expect(await auth().hasToken()).toBe(false);
    });

    it("rejects a state of another length than the cookie", async () => {
      await setup();
      const response = await callback({ state: "short", cookie: "longer-value" });
      expect(response.status).toBe(400);
      await response.text();
    });

    it.each([
      ["a missing code", { code: "", state: "s", cookie: "s" }],
      ["a missing state", { cookie: "s" }],
      ["a missing cookie", { state: "s", cookie: "" }],
    ])("rejects a callback with %s", async (_label, args) => {
      await setup();
      const response = await callback(args);
      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toContain("text/html");
      await response.text();
      expect(upstreamCalls).toHaveLength(0);
    });

    it.each<[string, Upstream]>([
      ["the code exchange fails", () => new Response("denied", { status: 400 })],
      ["the token answer has no access token", () => Response.json({ error: "invalid_grant" })],
      [
        "the profile call fails",
        (request) =>
          pathOf(request) === "/oauth/token"
            ? Response.json({ access_token: "access-1" })
            : new Response("nope", { status: 403 }),
      ],
      [
        "the profile answer has no user id",
        (request) =>
          pathOf(request) === "/oauth/token"
            ? Response.json({ access_token: "access-1" })
            : Response.json({ user_profile: {} }),
      ],
      [
        "NewsBlur is unreachable",
        () => {
          throw new TypeError("network down");
        },
      ],
    ])("answers 400 and stays signed out when %s", async (_label, reply) => {
      await setup();
      upstream = reply;
      const { state } = await startLogin();
      const response = await callback({ state });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Sign-in to NewsBlur failed");
      expect(await auth().hasToken()).toBe(false);
    });
  });

  describe("when serving a contract route", () => {
    const sameOrigin = { Origin: ORIGIN };

    it("answers 401 sign_in_required without a token", async () => {
      await setup();
      const response = await authed("/api/profile");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "sign_in_required" });
      expect(upstreamCalls).toHaveLength(0);
    });

    it("calls NewsBlur with the bearer token and answers the contract shape", async () => {
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

      const [call] = upstreamCalls;
      expect(call.url).toBe(`${env.NEWSBLUR_HOST}/social/load_user_profile`);
      expect(call.method).toBe("GET");
      expect(call.headers.get("Authorization")).toBe("Bearer access-1");
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

    it("answers 204 with no body for a same-origin DELETE without a Content-Type", async () => {
      await setup();
      await signIn();
      upstream = (request) =>
        pathOf(request) === "/reader/feeds"
          ? Response.json(feedsAnswer)
          : Response.json({ code: 1 });

      const response = await authed("/api/feeds/1", { method: "DELETE", headers: sameOrigin });
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(upstreamCalls.map((call) => pathOf(new Request(call.url)))).toEqual([
        "/reader/feeds",
        "/reader/delete_feed",
      ]);
    });

    it("clears the token when NewsBlur rejects it", async () => {
      await setup();
      await signIn();
      upstream = () => new Response("unauthorized", { status: 401 });

      const response = await authed("/api/profile");
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: "sign_in_required" });
      expect(await auth().hasToken()).toBe(false);
      expect(await status()).toEqual({ signedIn: false });
    });

    it("clears the token when NewsBlur answers as another user", async () => {
      await setup();
      await signIn();
      upstream = () =>
        Response.json({ authenticated: true, user_id: 7, user_profile: { username: "demo" } });

      const response = await authed("/api/profile");
      expect(response.status).toBe(401);
      await response.text();
      expect(await auth().hasToken()).toBe(false);
    });

    it("keeps the token on a non-auth failure", async () => {
      await setup();
      await signIn();
      upstream = () => new Response("down", { status: 500 });

      const response = await authed("/api/profile");
      expect(response.status).toBe(502);
      await response.text();
      expect(await auth().hasToken()).toBe(true);
    });

    it("returns 404 for an unknown /api/ path without calling upstream", async () => {
      await setup();
      await signIn();
      const response = await authed("/api/v3/profile");
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
      expect(upstreamCalls).toHaveLength(0);
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

  describe("when the NewsblurAuth feed cache is read", () => {
    it("serves a fresh entry and drops it on a token change", async () => {
      await setup();
      const { generation } = await auth().getFeedsCache();
      await auth().setFeedsCache({ value: feedsAnswer, generation });
      expect((await auth().getFeedsCache()).value).toEqual(feedsAnswer);
      await auth().setToken({ accessToken: "access-2", userId: USER_ID });
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
