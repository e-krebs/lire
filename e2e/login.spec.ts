import { generateKeyPair } from "jose";
import type { Page } from "./fixtures";
import {
  CLIENT_ID,
  expect,
  GOOD_REFRESH_TOKEN,
  OWNER,
  signAccessToken,
  test,
} from "./support/worker";

const ACCESS_HEADER = "Cf-Access-Jwt-Assertion";

const ui = (page: Page) => ({
  get csrfField() {
    return page.locator('input[name="csrf"]');
  },
  get refreshTokenField() {
    return page.getByLabel("Feedly refresh token");
  },
  get signInButton() {
    return page.getByRole("button", { name: "Sign in" });
  },
  get errorAlert() {
    return page.getByRole("alert");
  },
});

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
      });
      expect(response.status(), name).toBe(403);
    }

    const accepted = await request.get(`${worker.url}/api/auth/status`, {
      headers: { [ACCESS_HEADER]: worker.ownerToken },
    });
    expect(await accepted.json()).toEqual({ signedIn: false });
  });

  test.describe("when using the owner's Access token", () => {
    test.beforeEach(async ({ context, worker }) => {
      // Access adds this header at the edge in production.
      await context.setExtraHTTPHeaders({ [ACCESS_HEADER]: worker.ownerToken });
    });

    const signedIn = async ({ page, url }: { page: Page; url: string }): Promise<unknown> =>
      (await page.request.get(`${url}/api/auth/status`)).json();

    test("the login form's CSRF field must match its cookie", async ({ page, worker }) => {
      const pageUi = ui(page);
      await page.goto(`${worker.url}/api/auth/login`);
      // A URL filter drops Secure cookies on plain http, though the browser still sends them to 127.0.0.1.
      const cookies = await page.context().cookies();
      expect(cookies.find((cookie) => cookie.name === "lire_csrf")?.value).toBe(
        await pageUi.csrfField.inputValue(),
      );

      await pageUi.csrfField.evaluate((input: HTMLInputElement) => {
        input.value = "forged";
      });
      await pageUi.refreshTokenField.fill(GOOD_REFRESH_TOKEN);
      const posted = page.waitForResponse((response) => response.request().method() === "POST");
      await pageUi.signInButton.click();

      expect((await posted).status()).toBe(403);
      expect(worker.outbound).toEqual([]);
      expect(await signedIn({ page, url: worker.url })).toEqual({ signedIn: false });
    });

    test("a refresh token the feeds API rejects shows the error and stays signed out", async ({
      page,
      worker,
    }) => {
      const pageUi = ui(page);
      await page.goto(`${worker.url}/api/auth/login`);
      await pageUi.refreshTokenField.fill("refresh-rejected");
      const posted = page.waitForResponse((response) => response.request().method() === "POST");
      await pageUi.signInButton.click();

      expect((await posted).status()).toBe(400);
      await expect(pageUi.errorAlert).toHaveText("Sign-in failed, try again.");
      expect(worker.outbound).toHaveLength(1);
      expect(await signedIn({ page, url: worker.url })).toEqual({ signedIn: false });
    });

    test("a refresh token the feeds API accepts signs in and redirects home", async ({
      page,
      worker,
    }) => {
      const pageUi = ui(page);
      await page.goto(`${worker.url}/api/auth/login`);
      await pageUi.refreshTokenField.fill(GOOD_REFRESH_TOKEN);
      const posted = page.waitForResponse((response) => response.request().method() === "POST");
      await pageUi.signInButton.click();

      const response = await posted;
      expect(response.status()).toBe(302);
      expect(response.headers().location).toBe("/");
      expect(worker.outbound).toHaveLength(1);
      const [call] = worker.outbound;
      expect(Object.fromEntries(new URLSearchParams(call.body))).toEqual({
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: GOOD_REFRESH_TOKEN,
      });
      expect(await signedIn({ page, url: worker.url })).toEqual({ signedIn: true });
    });
  });
});
