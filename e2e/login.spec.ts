import { generateKeyPair } from "jose";
import {
  ACCESS_TOKEN,
  CLIENT_ID,
  CLIENT_SECRET,
  expect,
  GOOD_CODE,
  NEWSBLUR_ORIGIN,
  OWNER,
  signAccessToken,
  test,
} from "./support/worker";

const ACCESS_HEADER = "Cf-Access-Jwt-Assertion";
const STATE_COOKIE = "lire_oauth_state";

test.describe("Login", () => {
  test("the worker refuses any /api request without a valid Access token", async ({
    request,
    worker,
  }) => {
    const stranger = await generateKeyPair("RS256");
    const rejected = {
      none: undefined,
      "foreign key": await signAccessToken({ key: stranger.privateKey }),
      "wrong audience": await signAccessToken({ key: worker.privateKey, audience: "other-app" }),
      "wrong email": await signAccessToken({ key: worker.privateKey, email: `x${OWNER}` }),
    };
    for (const [name, token] of Object.entries(rejected)) {
      const response = await request.get(`${worker.url}/api/auth/login`, {
        headers: token ? { [ACCESS_HEADER]: token } : {},
        maxRedirects: 0,
      });
      expect(response.status(), name).toBe(403);
    }

    const accepted = await request.get(`${worker.url}/api/auth/status`, {
      headers: { [ACCESS_HEADER]: worker.ownerToken },
    });
    expect(await accepted.json()).toEqual({ signedIn: false });
  });

  test.describe("when using the owner's Access token", () => {
    // Raw requests, so the Secure state cookie is sent by hand instead of through a cookie jar.
    const headers = ({ ownerToken, state }: { ownerToken: string; state?: string }) => ({
      [ACCESS_HEADER]: ownerToken,
      ...(state ? { Cookie: `${STATE_COOKIE}=${state}` } : {}),
    });

    const startLogin = async ({
      request,
      worker,
    }: Pick<Parameters<Parameters<typeof test>[2]>[0], "request" | "worker">) => {
      const response = await request.get(`${worker.url}/api/auth/login`, {
        headers: headers({ ownerToken: worker.ownerToken }),
        maxRedirects: 0,
      });
      const authorize = new URL(response.headers().location);
      return { response, authorize, state: authorize.searchParams.get("state") ?? "" };
    };

    const callback = async ({
      request,
      worker,
      query,
      state,
    }: Pick<Parameters<Parameters<typeof test>[2]>[0], "request" | "worker"> & {
      query: Record<string, string>;
      state?: string;
    }) =>
      request.get(`${worker.url}/api/auth/callback?${new URLSearchParams(query)}`, {
        headers: headers({ ownerToken: worker.ownerToken, state }),
        maxRedirects: 0,
      });

    const signedIn = async ({
      request,
      worker,
    }: Pick<Parameters<Parameters<typeof test>[2]>[0], "request" | "worker">): Promise<unknown> =>
      (
        await request.get(`${worker.url}/api/auth/status`, {
          headers: headers({ ownerToken: worker.ownerToken }),
        })
      ).json();

    test("login redirects to the NewsBlur authorize page with a state cookie", async ({
      request,
      worker,
    }) => {
      const { response, authorize, state } = await startLogin({ request, worker });

      expect(response.status()).toBe(302);
      expect(authorize.origin).toBe(NEWSBLUR_ORIGIN);
      expect(authorize.pathname).toBe("/oauth/authorize");
      expect(authorize.searchParams.get("client_id")).toBe(CLIENT_ID);
      expect(authorize.searchParams.get("redirect_uri")).toBe(`${worker.url}/api/auth/callback`);
      expect(state).not.toBe("");
      expect(response.headers()["set-cookie"]).toContain(`${STATE_COOKIE}=${state}`);
      expect(worker.outbound).toEqual([]);
    });

    test("a callback whose state does not match its cookie fails without calling NewsBlur", async ({
      request,
      worker,
    }) => {
      const { state } = await startLogin({ request, worker });
      const response = await callback({
        request,
        worker,
        query: { code: GOOD_CODE, state: "forged" },
        state,
      });

      expect(response.status()).toBe(400);
      expect(response.headers()["set-cookie"]).toContain("Max-Age=0");
      expect(worker.outbound).toEqual([]);
      expect(await signedIn({ request, worker })).toEqual({ signedIn: false });
    });

    test("a code NewsBlur rejects fails and stays signed out", async ({ request, worker }) => {
      const { state } = await startLogin({ request, worker });
      const response = await callback({
        request,
        worker,
        query: { code: "code-rejected", state },
        state,
      });

      expect(response.status()).toBe(400);
      expect(response.headers()["set-cookie"]).toContain("Max-Age=0");
      expect(worker.outbound).toHaveLength(1);
      expect(await signedIn({ request, worker })).toEqual({ signedIn: false });
    });

    test("a code NewsBlur accepts signs in and redirects home", async ({ request, worker }) => {
      const { state } = await startLogin({ request, worker });
      const response = await callback({
        request,
        worker,
        query: { code: GOOD_CODE, state },
        state,
      });

      expect(response.status()).toBe(302);
      expect(response.headers().location).toBe("/");
      const [exchange, profile] = worker.outbound;
      expect(Object.fromEntries(new URLSearchParams(exchange.body))).toEqual({
        grant_type: "authorization_code",
        code: GOOD_CODE,
        redirect_uri: `${worker.url}/api/auth/callback`,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      });
      expect(profile.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(await signedIn({ request, worker })).toEqual({ signedIn: true });
    });
  });
});
