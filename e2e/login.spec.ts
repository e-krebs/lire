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
    expect(await accepted.json()).toEqual({ signedIn: true });
  });

  test.describe("when using the owner's Access token", () => {
    type Fixtures = Pick<Parameters<Parameters<typeof test>[2]>[0], "request" | "worker">;

    const headers = ({ ownerToken }: { ownerToken: string }) => ({ [ACCESS_HEADER]: ownerToken });

    const login = async ({ request, worker }: Fixtures) =>
      request.get(`${worker.url}/api/auth/login`, {
        headers: headers({ ownerToken: worker.ownerToken }),
        maxRedirects: 0,
      });

    const signedIn = async ({ request, worker }: Fixtures): Promise<unknown> =>
      (
        await request.get(`${worker.url}/api/auth/status`, {
          headers: headers({ ownerToken: worker.ownerToken }),
        })
      ).json();

    test("login signs in with the Worker's credentials and redirects home", async ({
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
      expect(await signedIn({ request, worker })).toEqual({ signedIn: true });
    });

    test("a request signs in on its own when no session is stored", async ({ request, worker }) => {
      expect(await signedIn({ request, worker })).toEqual({ signedIn: true });
      expect(worker.outbound).toHaveLength(2);
    });

    test.describe("when NewsBlur refuses the Worker's password", () => {
      test.use({ workerPassword: "wrong-password" });

      test("login fails and the owner stays signed out", async ({ request, worker }) => {
        const response = await login({ request, worker });

        expect(response.status()).toBe(400);
        expect(worker.outbound).toHaveLength(1);
        expect(await signedIn({ request, worker })).toEqual({ signedIn: false });
      });
    });
  });
});
