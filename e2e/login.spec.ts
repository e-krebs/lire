import { generateKeyPair } from "jose";
import {
  expect,
  OWNER,
  PASSWORD,
  SESSION_ID,
  signAccessToken,
  test,
  USERNAME,
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

    const login = async ({ request, worker }: Fixtures) =>
      request.get(`${worker.url}/api/auth/login`, {
        headers: headers({ ownerToken: worker.ownerToken }),
        maxRedirects: 0,
      });

    // The browser keeps lire_session; the spec sends it back by hand.
    const cookieOf = (response: { headers(): Record<string, string> }) =>
      response.headers()["set-cookie"]?.split(";")[0];

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

    test("login signs in with the Worker's credentials, sets the cookie and redirects home", async ({
      request,
      worker,
    }) => {
      const response = await login({ request, worker });

      expect(response.status()).toBe(302);
      expect(response.headers().location).toBe("/");
      const [loginCall, profile] = worker.outbound;
      expect(Object.fromEntries(new URLSearchParams(loginCall.body))).toEqual({
        username: USERNAME,
        password: PASSWORD,
      });
      expect(profile.cookie).toBe(`newsblur_sessionid=${SESSION_ID}`);
      const cookie = cookieOf(response);
      expect(cookie).toMatch(/^lire_session=owner\./);
      expect(await signedIn({ request, worker, cookie })).toEqual({ signedIn: true, userId: 42 });
    });

    test("a request with no cookie answers signedIn false and makes no NewsBlur call", async ({
      request,
      worker,
    }) => {
      expect(await signedIn({ request, worker })).toEqual({ signedIn: false });
      expect(worker.outbound).toHaveLength(0);
    });

    test.describe("when NewsBlur refuses the Worker's password", () => {
      test.use({ workerPassword: "wrong-password" });

      test("login fails and the owner stays signed out", async ({ request, worker }) => {
        const response = await login({ request, worker });

        expect(response.status()).toBe(400);
        expect(response.headers()["set-cookie"]).toBeUndefined();
        expect(worker.outbound).toHaveLength(1);
        expect(await signedIn({ request, worker })).toEqual({ signedIn: false });
      });
    });
  });
});
