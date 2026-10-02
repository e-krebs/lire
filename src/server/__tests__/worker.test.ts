// oxlint-disable typescript/no-deprecated -- SELF is the vitest-pool-workers integration Fetcher;
// the suggested exports.default.fetch() has a different signature/dispatch, not a drop-in.
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessError, verifyAccess } from "../access";

const ORIGIN = "https://lire.krebs.tech";
const OWNER = "owner@example.com";
const KID = "test-key";

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
  return SELF.fetch(`${ORIGIN}${path}`, { ...init, headers });
};

type Upstream = (request: Request) => Response | Promise<Response>;
// Bodies are read eagerly: a Request created inside the DO can't be read from the test's context.
type UpstreamCall = { url: string; method: string; headers: Headers; body: string };

let upstream: Upstream;
const upstreamCalls: UpstreamCall[] = [];

const tokenReply = (
  accessToken: string,
  { refreshToken = "refresh-rotated", expiresIn = 3600 } = {},
) =>
  Response.json({ access_token: accessToken, expires_in: expiresIn, refresh_token: refreshToken });

const tokenCalls = () => upstreamCalls.filter((r) => r.url === `${env.FEEDLY_HOST}/v3/auth/token`);
const apiCalls = () => upstreamCalls.filter((r) => r.url !== `${env.FEEDLY_HOST}/v3/auth/token`);

const csrfFromLoginPage = async () => {
  const response = await authed("/api/auth/login");
  const cookie = response.headers.get("Set-Cookie") ?? "";
  const token = /lire_csrf=([0-9a-f]+)/.exec(cookie)?.[1];
  if (!token) throw new Error("login page set no CSRF cookie");
  await response.text();
  return token;
};

const postLogin = async ({
  refreshToken,
  csrf,
  origin = ORIGIN,
  cookie = csrf,
}: {
  refreshToken: string;
  csrf: string;
  origin?: string;
  cookie?: string;
}) =>
  authed("/api/auth/login", {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: origin,
      Cookie: `lire_csrf=${cookie}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ refreshToken, csrf }).toString(),
  });

const status = async () => (await authed("/api/auth/status")).json();

const signIn = async () => {
  const response = await postLogin({ refreshToken: "refresh-1", csrf: await csrfFromLoginPage() });
  expect(response.status).toBe(302);
  upstreamCalls.length = 0;
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
  await env.FEEDLY_AUTH.get(env.FEEDLY_AUTH.idFromName("singleton")).clearTokens();
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

    it("admits a valid token for the owner", async () => {
      await setup();
      const response = await authed("/api/auth/status");
      expect(response.status).toBe(200);
    });
  });

  describe("when auth routes are hit", () => {
    it("reports signedIn false before provisioning and true after login", async () => {
      await setup();
      upstream = () => tokenReply("access-1");

      expect(await status()).toEqual({ signedIn: false });

      const csrf = await csrfFromLoginPage();
      const login = await postLogin({ refreshToken: "refresh-1", csrf });
      expect(login.status).toBe(302);
      expect(login.headers.get("Location")).toBe("/");

      const [refresh] = tokenCalls();
      expect(refresh.method).toBe("POST");
      expect(Object.fromEntries(new URLSearchParams(refresh.body))).toEqual({
        client_id: env.FEEDLY_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: "refresh-1",
      });

      expect(await status()).toEqual({ signedIn: true });
    });

    it("serves an HTML form with a CSRF cookie on GET /api/auth/login", async () => {
      await setup();
      const response = await authed("/api/auth/login");
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/html");
      expect(response.headers.get("Set-Cookie")).toMatch(/lire_csrf=[0-9a-f]+;.*HttpOnly; Secure/);
      const html = await response.text();
      expect(html).toContain('<form method="post" action="/api/auth/login">');
      expect(html).toContain('name="refreshToken"');
      expect(html).toContain('name="csrf"');
    });

    it("rejects a cross-origin login POST", async () => {
      await setup();
      const csrf = await csrfFromLoginPage();
      const response = await postLogin({
        refreshToken: "refresh-evil",
        csrf,
        origin: "https://demo.lire.krebs.tech",
      });
      expect(response.status).toBe(403);
      expect(tokenCalls()).toHaveLength(0);
    });

    it("rejects a login POST whose CSRF field does not match the cookie", async () => {
      await setup();
      const csrf = await csrfFromLoginPage();
      const response = await postLogin({ refreshToken: "refresh-1", csrf, cookie: "0".repeat(64) });
      expect(response.status).toBe(403);
      expect(tokenCalls()).toHaveLength(0);
    });

    it("re-serves the form with 400 and stays signed out when the feeds API rejects the token", async () => {
      await setup();
      upstream = () => Response.json({ errorCode: 400 }, { status: 400 });
      const response = await postLogin({
        refreshToken: "refresh-bad",
        csrf: await csrfFromLoginPage(),
      });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Sign-in failed");

      expect(await status()).toEqual({ signedIn: false });
    });

    it("keeps a previously signed-in owner signed in when a pasted token is rejected", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = () => Response.json({ errorCode: 400 }, { status: 400 });

      const response = await postLogin({
        refreshToken: "refresh-bad",
        csrf: await csrfFromLoginPage(),
      });
      expect(response.status).toBe(400);
      await response.text();
      expect(await status()).toEqual({ signedIn: true });

      upstream = () => Response.json({ id: "user-1" });
      await authed("/api/v3/profile");
      expect(apiCalls().map((r) => r.headers.get("Authorization"))).toEqual(["OAuth access-1"]);
    });

    it("re-serves the form with 503 and keeps the stored token when the feeds API is unavailable", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = () => new Response(null, { status: 429 });

      const response = await postLogin({
        refreshToken: "refresh-2",
        csrf: await csrfFromLoginPage(),
      });
      expect(response.status).toBe(503);
      expect(await response.text()).toContain("Sign-in failed");
      expect(await status()).toEqual({ signedIn: true });
    });
  });

  describe("when proxying an API request", () => {
    const isTokenCall = (request: Request) => request.url.endsWith("/v3/auth/token");
    const refreshTokenOf = async (request: Request) =>
      (await request.clone().formData()).get("refresh_token");
    const postJson = async ({
      path,
      body,
      origin = ORIGIN,
      contentType = "application/json",
    }: {
      path: string;
      body: unknown;
      origin?: string;
      contentType?: string;
    }) =>
      authed(path, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": contentType },
        body: JSON.stringify(body),
      });

    it("returns 401 sign_in_required before provisioning", async () => {
      await setup();
      const response = await authed("/api/v3/profile");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "sign_in_required" });
      expect(upstreamCalls).toHaveLength(0);
    });

    it("forwards an allowed path to FEEDLY_HOST with an OAuth header and does not forward Set-Cookie", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = () =>
        Response.json(
          { id: "user-1" },
          {
            headers: {
              "Set-Cookie": "session=upstream",
            },
          },
        );

      const response = await authed("/api/v3/streams/contents?streamId=feed%2F1&count=20");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: "user-1" });
      expect(response.headers.get("Content-Type")).toContain("application/json");
      expect(response.headers.get("Set-Cookie")).toBeNull();

      const [call] = apiCalls();
      expect(call.url).toBe(`${env.FEEDLY_HOST}/v3/streams/contents?streamId=feed%2F1&count=20`);
      expect(call.headers.get("Authorization")).toBe("OAuth access-1");
      expect(tokenCalls()).toHaveLength(0);
    });

    it("returns 404 for a path outside the allowlist without calling upstream", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();

      const response = await authed("/api/v3/opml");
      expect(response.status).toBe(404);
      expect(upstreamCalls).toHaveLength(0);
    });

    it("force-refreshes once and retries after a first upstream 401", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      let profileCalls = 0;
      upstream = (request) => {
        if (request.url.endsWith("/v3/auth/token")) return tokenReply("access-2");
        profileCalls += 1;
        return profileCalls === 1
          ? new Response(null, { status: 401 })
          : Response.json({ id: "user-1" });
      };

      const response = await authed("/api/v3/profile");
      expect(response.status).toBe(200);
      expect(tokenCalls()).toHaveLength(1);
      expect(apiCalls().map((r) => r.headers.get("Authorization"))).toEqual([
        "OAuth access-1",
        "OAuth access-2",
      ]);
    });

    it("forwards the client IP to the feeds API when Cloudflare provides one", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = () => Response.json({});

      await authed("/api/v3/profile", { headers: { "CF-Connecting-IP": "203.0.113.7" } });

      const [call] = apiCalls();
      expect(call.headers.get("X-Forwarded-For")).toBe("203.0.113.7");
      expect(call.headers.get("X-Real-IP")).toBe("203.0.113.7");
    });

    it("exposes upstream diagnostic headers on an error answer only", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = () =>
        Response.json("boom", {
          status: 400,
          headers: { "x-feedly-server": "sv1", "x-other": "kept-back" },
        });

      const response = await authed("/api/v3/profile");
      expect(response.status).toBe(400);
      expect(response.headers.get("x-upstream-status")).toBe("400");
      expect(response.headers.get("x-upstream-x-feedly-server")).toBe("sv1");
      expect(response.headers.get("x-upstream-x-other")).toBeNull();
    });

    it("returns 401 without clearing tokens after a second upstream 401", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = (request) =>
        isTokenCall(request) ? tokenReply("access-2") : new Response(null, { status: 401 });

      const response = await authed("/api/v3/profile");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "sign_in_required" });
      expect(tokenCalls()).toHaveLength(1);
      expect(apiCalls()).toHaveLength(2);
      expect(await status()).toEqual({ signedIn: true });
    });

    it("clears tokens and returns 401 when the force refresh is rejected", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = (request) =>
        isTokenCall(request)
          ? Response.json({ errorCode: 401 }, { status: 401 })
          : new Response(null, { status: 401 });

      const response = await authed("/api/v3/profile");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "sign_in_required" });
      expect(apiCalls()).toHaveLength(1);
      expect(await status()).toEqual({ signedIn: false });
    });

    it("returns 503 and stays signed in when the token endpoint is rate limited", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = (request) =>
        isTokenCall(request)
          ? new Response(null, { status: 429 })
          : new Response(null, { status: 401 });

      const response = await authed("/api/v3/profile");
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "upstream_unavailable" });
      expect(await status()).toEqual({ signedIn: true });
    });

    it("keeps the credentials of a login that completes while a request is being retried", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      const csrf = await csrfFromLoginPage();
      let retriedLogin: Response | undefined;
      upstream = async (request) => {
        if (!isTokenCall(request)) {
          if (request.headers.get("Authorization") === "OAuth access-1") {
            retriedLogin = await postLogin({ refreshToken: "refresh-2", csrf });
          }
          return new Response(null, { status: 401 });
        }
        return (await refreshTokenOf(request)) === "refresh-2"
          ? tokenReply("access-2", { refreshToken: "refresh-2-rotated" })
          : Response.json({ errorCode: 401 }, { status: 401 });
      };

      const response = await authed("/api/v3/profile");
      expect(response.status).toBe(401);
      expect(retriedLogin?.status).toBe(302);
      expect(await status()).toEqual({ signedIn: true });
    });

    it("keeps the credentials of a login that completes while a rejected refresh is in flight", async () => {
      await setup();
      // Inside the 60s skew, so the next request refreshes.
      upstream = () => tokenReply("access-1", { expiresIn: 1 });
      await signIn();
      const csrf = await csrfFromLoginPage();
      let rejectedLogin: Response | undefined;
      upstream = async (request) => {
        if ((await refreshTokenOf(request)) === "refresh-rotated") {
          rejectedLogin = await postLogin({ refreshToken: "refresh-2", csrf });
          return Response.json({ errorCode: 401 }, { status: 401 });
        }
        return tokenReply("access-2", { refreshToken: "refresh-2-rotated" });
      };

      const response = await authed("/api/v3/profile");
      expect(response.status).toBe(401);
      expect(rejectedLogin?.status).toBe(302);
      expect(await response.json()).toEqual({ error: "sign_in_required" });
      expect(await status()).toEqual({ signedIn: true });
    });

    it("clears tokens and returns 401 when the first refresh is rejected", async () => {
      await setup();
      upstream = () => tokenReply("access-1", { expiresIn: 1 });
      await signIn();
      upstream = () => Response.json({ errorCode: 401 }, { status: 401 });

      const response = await authed("/api/v3/profile");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "sign_in_required" });
      expect(apiCalls()).toHaveLength(0);
      expect(await status()).toEqual({ signedIn: false });
    });

    it("forwards a same-origin JSON POST with exactly application/json", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = () => new Response(null, { status: 200 });

      const response = await postJson({
        path: "/api/v3/markers",
        body: { action: "markAsRead" },
        contentType: "application/json; charset=utf-8",
      });
      expect(response.status).toBe(200);
      const [call] = apiCalls();
      expect(call.headers.get("Content-Type")).toBe("application/json");
      expect(JSON.parse(call.body)).toEqual({ action: "markAsRead" });
    });

    it("proxies a newsletter address POST with an empty JSON body", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = () => Response.json({ emailAddress: "a@feedly.email", feedId: "feed/a" });

      const response = await postJson({ path: "/api/v3/feeds/newsletters", body: {} });
      expect(response.status).toBe(200);
      const [call] = apiCalls();
      expect(call.url).toBe(`${env.FEEDLY_HOST}/v3/feeds/newsletters`);
      expect(JSON.parse(call.body)).toEqual({});
    });

    it("forwards a same-origin DELETE without a Content-Type", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = () => new Response(null, { status: 200 });

      const response = await authed("/api/v3/subscriptions/feed%2F1", {
        method: "DELETE",
        headers: { Origin: ORIGIN },
      });
      expect(response.status).toBe(200);
      expect(apiCalls()[0].headers.get("Content-Type")).toBeNull();
    });

    it("rejects a cross-origin proxy POST without calling upstream", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();

      const response = await postJson({
        path: "/api/v3/markers",
        body: { action: "markAsRead" },
        origin: "https://demo.lire.krebs.tech",
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden" });
      expect(upstreamCalls).toHaveLength(0);
    });

    it("rejects a same-origin proxy POST that is not JSON", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();

      const response = await postJson({
        path: "/api/v3/markers",
        body: { action: "markAsRead" },
        contentType: "text/plain",
      });
      expect(response.status).toBe(403);
      expect(upstreamCalls).toHaveLength(0);
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

  describe("when FeedlyAuth handles concurrent refreshes", () => {
    const auth = () => env.FEEDLY_AUTH.get(env.FEEDLY_AUTH.idFromName("singleton"));

    it("shares one refresh between overlapping callers", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = () => tokenReply("access-2");

      // Both calls start in one turn, so the second deterministically finds the first in flight.
      const results = await runInDurableObject(auth(), async (instance) =>
        Promise.all([
          instance.getAccessToken({ rejectedAccessToken: "access-1" }),
          instance.getAccessToken({ rejectedAccessToken: "access-1" }),
        ]),
      );
      expect(results).toEqual([
        { ok: true, token: "access-2" },
        { ok: true, token: "access-2" },
      ]);
      expect(tokenCalls()).toHaveLength(1);
    });

    it("keeps sharing a refresh while a pasted token refreshes alongside it", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = () => tokenReply("access-2");

      await runInDurableObject(auth(), async (instance) =>
        Promise.all([
          instance.getAccessToken({ rejectedAccessToken: "access-1" }),
          instance.replaceRefreshToken("refresh-pasted"),
          instance.getAccessToken({ rejectedAccessToken: "access-1" }),
        ]),
      );
      expect(tokenCalls()).toHaveLength(2);
    });

    it("drops a refresh result when the tokens are cleared mid-refresh", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      await signIn();
      upstream = () => tokenReply("access-2");

      const result = await runInDurableObject(auth(), async (instance) => {
        const pending = instance.getAccessToken({ rejectedAccessToken: "access-1" });
        instance.clearTokens();
        return pending;
      });
      expect(result).toEqual({ ok: true, token: "access-2" });
      expect(await status()).toEqual({ signedIn: false });
    });

    it("keeps the current refresh token when the feeds API does not rotate it", async () => {
      await setup();
      upstream = () => Response.json({ access_token: "access-1", expires_in: 3600 });
      await signIn();

      await auth().getAccessToken({ rejectedAccessToken: "access-1" });
      const [refresh] = tokenCalls();
      expect(new URLSearchParams(refresh.body).get("refresh_token")).toBe("refresh-1");
    });
  });

  describe("when checking a login POST request", () => {
    const loginPost = async ({ headers, body }: { headers: HeadersInit; body: BodyInit }) =>
      authed("/api/auth/login", { method: "POST", redirect: "manual", headers, body });

    const loginForm = ({
      csrf,
      refreshToken = "refresh-1",
    }: {
      csrf: string;
      refreshToken?: string;
    }) => new URLSearchParams({ refreshToken, csrf }).toString();

    const formHeaders = { "Content-Type": "application/x-www-form-urlencoded" };

    it("accepts a same-origin Referer when Origin is absent", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      const csrf = await csrfFromLoginPage();
      const response = await loginPost({
        headers: {
          ...formHeaders,
          Referer: `${ORIGIN}/api/auth/login`,
          Cookie: `lire_csrf=${csrf}`,
        },
        body: loginForm({ csrf }),
      });
      expect(response.status).toBe(302);
    });

    it("rejects a login POST with neither Origin nor Referer", async () => {
      await setup();
      const csrf = await csrfFromLoginPage();
      const response = await loginPost({
        headers: { ...formHeaders, Cookie: `lire_csrf=${csrf}` },
        body: loginForm({ csrf }),
      });
      expect(response.status).toBe(403);
    });

    it("rejects a login POST with an unparseable Referer", async () => {
      await setup();
      const csrf = await csrfFromLoginPage();
      const response = await loginPost({
        headers: { ...formHeaders, Referer: "not a url", Cookie: `lire_csrf=${csrf}` },
        body: loginForm({ csrf }),
      });
      expect(response.status).toBe(403);
    });

    it("rejects a login POST without a CSRF cookie", async () => {
      await setup();
      const csrf = await csrfFromLoginPage();
      const response = await loginPost({
        headers: { ...formHeaders, Origin: ORIGIN },
        body: loginForm({ csrf }),
      });
      expect(response.status).toBe(403);
    });

    it("finds the CSRF cookie among other cookies", async () => {
      await setup();
      upstream = () => tokenReply("access-1");
      const csrf = await csrfFromLoginPage();
      const response = await loginPost({
        headers: { ...formHeaders, Origin: ORIGIN, Cookie: `theme=dark; lire_csrf=${csrf}` },
        body: loginForm({ csrf }),
      });
      expect(response.status).toBe(302);
    });

    it("rejects a CSRF field sent as a file", async () => {
      await setup();
      const csrf = await csrfFromLoginPage();
      const form = new FormData();
      form.set("refreshToken", "refresh-1");
      form.set("csrf", new Blob([csrf]), "csrf.txt");
      const response = await loginPost({
        headers: { Origin: ORIGIN, Cookie: `lire_csrf=${csrf}` },
        body: form,
      });
      expect(response.status).toBe(403);
    });

    it("re-serves the form with 400 for a blank refresh token", async () => {
      await setup();
      const response = await postLogin({ refreshToken: "   ", csrf: await csrfFromLoginPage() });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Sign-in failed");
      expect(tokenCalls()).toHaveLength(0);
    });
  });

  describe("when hitting an unknown /api/ path", () => {
    it("returns 404 for an unknown /api/ path", async () => {
      await setup();
      const response = await authed("/api/unknown");
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    });
  });
});
