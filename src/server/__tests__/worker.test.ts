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

const loginReply = (sessionId: string) =>
  Response.json(
    { authenticated: true, code: 1, errors: {} },
    { headers: { "Set-Cookie": `newsblur_sessionid=${sessionId}; Path=/; HttpOnly` } },
  );

// The answers a successful sign-in reads: the login that sets the cookie, then the profile that
// names the user.
const signInUpstream =
  ({
    userId = USER_ID,
    sessionId = SESSION_ID,
  }: { userId?: number; sessionId?: string } = {}): Upstream =>
  (request) => {
    if (pathOf(request) === "/api/login") return loginReply(sessionId);
    return Response.json({
      user_profile: { user_id: userId, username: "owner" },
      authenticated: true,
      user_id: userId,
    });
  };

const status = async () => (await authed("/api/auth/status")).json();

const signIn = async () => {
  upstream = signInUpstream();
  const response = await authed("/api/auth/login");
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
    it("logs in with the stored credentials, keeps the session and reports signedIn", async () => {
      await setup();
      upstream = signInUpstream();

      const response = await authed("/api/auth/login");
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");
      expect(response.headers.get("Cache-Control")).toBe("no-store");

      const [login, profile] = upstreamCalls;
      expect(login.url).toBe(`${env.NEWSBLUR_HOST}/api/login`);
      expect(login.method).toBe("POST");
      expect(Object.fromEntries(new URLSearchParams(login.body))).toEqual({
        username: env.NEWSBLUR_USERNAME,
        password: env.NEWSBLUR_PASSWORD,
      });
      expect(profile.url).toBe(`${env.NEWSBLUR_HOST}/social/load_user_profile`);
      expect(profile.headers.get("Cookie")).toBe(`newsblur_sessionid=${SESSION_ID}`);

      expect(await auth().getSession()).toEqual({ sessionId: SESSION_ID, userId: USER_ID });
      expect(await status()).toEqual({ signedIn: true });
    });

    it("finds the session cookie among other Set-Cookie lines", async () => {
      await setup();
      upstream = async (request) => {
        if (pathOf(request) !== "/api/login") return signInUpstream()(request);
        const headers = new Headers();
        headers.append("Set-Cookie", "csrftoken=abc; Path=/");
        headers.append("Set-Cookie", `newsblur_sessionid=${SESSION_ID}; Path=/; HttpOnly`);
        return new Response(JSON.stringify({ authenticated: true }), { headers });
      };

      const response = await authed("/api/auth/login");
      expect(response.status).toBe(302);
      expect((await auth().getSession())?.sessionId).toBe(SESSION_ID);
    });

    it("sends a User-Agent on every NewsBlur call", async () => {
      await setup();
      upstream = signInUpstream();

      await authed("/api/profile");
      expect(upstreamCalls.length).toBeGreaterThan(2);
      for (const call of upstreamCalls) expect(call.headers.get("User-Agent")).toBe("Lire");
    });

    it("logs in on its own when a request finds no session", async () => {
      await setup();
      upstream = signInUpstream();

      const response = await authed("/api/profile");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ username: "owner" });
      expect(upstreamCalls.map((call) => pathOf(new Request(call.url)))).toEqual([
        "/api/login",
        "/social/load_user_profile",
        "/social/load_user_profile",
      ]);
      expect(upstreamCalls[2].headers.get("Cookie")).toBe(`newsblur_sessionid=${SESSION_ID}`);
    });

    it.each<[string, Upstream]>([
      ["NewsBlur answers the login with an error", () => new Response("down", { status: 500 })],
      [
        "NewsBlur refuses the credentials",
        () => Response.json({ authenticated: false, code: -1, errors: { __all__: ["Bad"] } }),
      ],
      ["the login answer has an unexpected shape", () => Response.json({ code: 1 })],
      ["the login answer sets no session cookie", () => Response.json({ authenticated: true })],
      [
        "the profile call fails",
        (request) =>
          pathOf(request) === "/api/login"
            ? loginReply(SESSION_ID)
            : new Response("nope", { status: 403 }),
      ],
      [
        "the profile answer has no user id",
        (request) =>
          pathOf(request) === "/api/login"
            ? loginReply(SESSION_ID)
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
      const response = await authed("/api/auth/login");
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Sign-in to NewsBlur failed");
      expect(await auth().hasSession()).toBe(false);
      expect(await status()).toEqual({ signedIn: false });
    });
  });

  describe("when serving a contract route", () => {
    const sameOrigin = { Origin: ORIGIN };

    it("answers 401 sign_in_required when the login fails", async () => {
      await setup();
      const response = await authed("/api/profile");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "sign_in_required" });
      expect(upstreamCalls.map((call) => new URL(call.url).pathname)).toEqual(["/api/login"]);
    });

    it("calls NewsBlur with the session cookie and answers the contract shape", async () => {
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
      expect(call.headers.get("Cookie")).toBe(`newsblur_sessionid=${SESSION_ID}`);
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
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).toBe("");
      expect(upstreamCalls.map((call) => pathOf(new Request(call.url)))).toEqual([
        "/reader/feeds",
        "/reader/delete_feed",
      ]);
    });

    it("logs in again when NewsBlur rejects the session", async () => {
      await setup();
      await signIn();
      upstream = async (request) => {
        if (pathOf(request) === "/api/login") return loginReply("session-2");
        if (request.headers.get("Cookie") === "newsblur_sessionid=session-2") {
          return signInUpstream()(request);
        }
        return new Response("unauthorized", { status: 401 });
      };

      const response = await authed("/api/profile");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ username: "owner" });
      expect((await auth().getSession())?.sessionId).toBe("session-2");
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
        upstreamCalls.filter((call) => new URL(call.url).pathname === "/api/login"),
      ).toHaveLength(0);
      expect(await auth().hasSession()).toBe(false);
    });

    it("logs in only once per request when the fresh session is rejected too", async () => {
      await setup();
      upstream = async (request) => {
        const path = pathOf(request);
        if (path === "/api/login") return loginReply(SESSION_ID);
        if (path === "/social/load_user_profile") return signInUpstream()(request);
        return new Response("unauthorized", { status: 401 });
      };

      const response = await authed("/api/categories");
      expect(response.status).toBe(401);
      await response.text();
      expect(
        upstreamCalls.filter((call) => new URL(call.url).pathname === "/api/login"),
      ).toHaveLength(1);
      expect(await auth().hasSession()).toBe(false);
    });

    it("clears the session when NewsBlur rejects it and the login fails", async () => {
      await setup();
      await signIn();
      upstream = () => new Response("unauthorized", { status: 401 });

      const response = await authed("/api/profile");
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: "sign_in_required" });
      expect(await auth().hasSession()).toBe(false);
      expect(await status()).toEqual({ signedIn: false });
    });

    it("clears the session when NewsBlur answers as another user", async () => {
      await setup();
      await signIn();
      upstream = () =>
        Response.json({ authenticated: true, user_id: 7, user_profile: { username: "demo" } });

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
    it("serves a fresh entry and drops it on a session change", async () => {
      await setup();
      const { generation } = await auth().getFeedsCache();
      await auth().setFeedsCache({ value: feedsAnswer, generation });
      expect((await auth().getFeedsCache()).value).toEqual(feedsAnswer);
      await auth().setSession({ sessionId: "session-2", userId: USER_ID });
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
      await auth().setSession({ sessionId: "session-2", userId: USER_ID });
      await auth().clearSession({ onlySessionId: "session-1" });
      expect(await auth().hasSession()).toBe(true);
      await auth().clearSession({ onlySessionId: "session-2" });
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
