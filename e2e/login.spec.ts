import { generateKeyPair } from "jose";
import {
  expect,
  OWNER,
  CLIENT_SECRET,
  ACCESS_TOKEN,
  signAccessToken,
  test,
} from "./support/worker";

const ACCESS_HEADER = "Cf-Access-Jwt-Assertion";

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
    type Fixtures = Pick<Parameters<Parameters<typeof test>[2]>[0], "request" | "worker">;

    const headers = ({ ownerToken }: { ownerToken: string }) => ({ [ACCESS_HEADER]: ownerToken });

    const login = async ({ request, worker }: Fixtures) => {
      const start = await request.get(`${worker.url}/api/auth/login`, {
        headers: headers({ ownerToken: worker.ownerToken }),
        maxRedirects: 0,
      });
      expect(start.status()).toBe(302);
      const authorize = new URL(start.headers().location);
      expect(authorize.pathname).toBe("/oauth/authorize");
      const state = authorize.searchParams.get("state")!;
      return request.get(`${worker.url}/api/auth/callback?code=e2e-code&state=${state}`, {
        headers: {
          ...headers({ ownerToken: worker.ownerToken }),
          Cookie: start.headers()["set-cookie"].split(";")[0],
        },
        maxRedirects: 0,
      });
    };

    // The browser keeps lire_session; the spec sends it back by hand.
    const cookieOf = (response: { headers(): Record<string, string> }) =>
      response
        .headers()
        ["set-cookie"]?.split("\n")
        .find((line) => line.startsWith("lire_session="))
        ?.split(";")[0];

    const signedIn = async ({
      request,
      worker,
      cookie,
    }: Fixtures & { cookie?: string }): Promise<unknown> =>
      (
        await request.get(`${worker.url}/api/auth/status`, {
          headers: {
            ...headers({ ownerToken: worker.ownerToken }),
            ...(cookie ? { Cookie: cookie } : {}),
          },
        })
      ).json();

    test("OAuth callback sets a user id cookie and redirects home", async ({ request, worker }) => {
      const response = await login({ request, worker });

      expect(response.status()).toBe(302);
      expect(response.headers().location).toBe("/");
      const [loginCall, profile] = worker.outbound;
      expect(Object.fromEntries(new URLSearchParams(loginCall.body))).toEqual({
        grant_type: "authorization_code",
        code: "e2e-code",
        client_id: "e2e-client",
        client_secret: CLIENT_SECRET,
        redirect_uri: `${worker.url}/api/auth/callback`,
      });
      expect(profile.cookie).toBeNull();
      expect(profile.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      const cookie = cookieOf(response);
      expect(cookie).toMatch(/^lire_session=42\./);
      expect(await signedIn({ request, worker, cookie })).toEqual({ signedIn: true, userId: 42 });
    });

    test("a request with no cookie answers signedIn false and makes no NewsBlur call", async ({
      request,
      worker,
    }) => {
      expect(await signedIn({ request, worker })).toEqual({ signedIn: false });
      expect(worker.outbound).toHaveLength(0);
    });

    test.describe("when NewsBlur refuses the OAuth client secret", () => {
      test.use({ workerClientSecret: "wrong-secret" });

      test("login fails and the owner stays signed out", async ({ request, worker }) => {
        const response = await login({ request, worker });

        expect(response.status()).toBe(400);
        expect(response.headers()["set-cookie"]).toContain("Max-Age=0");
        expect(worker.outbound).toHaveLength(1);
        expect(await signedIn({ request, worker })).toEqual({ signedIn: false });
      });
    });
  });
});
