import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
// Miniflare's own classes: outboundService speaks its undici Request and Response.
import { Miniflare, Response, type Request } from "miniflare";
import { expect, test as base } from "e2e/fixtures";

// Reserved .test names: every outbound fetch lands in outboundService, and nothing reaches a real
// Access team or NewsBlur.
const TEAM_DOMAIN = "access.test";
const NEWSBLUR_HOST = "https://newsblur.test";
const AUDIENCE = "lire-e2e";
export const OWNER = "owner@example.com";
export const USERNAME = "owner";
export const PASSWORD = "e2e-password";
export const SESSION_ID = "session-e2e";
const USER_ID = 42;
const KID = "e2e-key";

type Keys = { privateKey: CryptoKey; publicJwk: JWK };

export const signAccessToken = async ({
  key,
  email = OWNER,
  audience = AUDIENCE,
}: {
  key: CryptoKey;
  email?: string;
  audience?: string;
}): Promise<string> =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(`https://${TEAM_DOMAIN}`)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);

// Bodies are read eagerly, before the worker's request is gone.
type OutboundCall = { url: string; body: string; cookie: string | null };

const loginEndpoint = (call: OutboundCall): Response => {
  const form = new URLSearchParams(call.body);
  if (form.get("username") !== USERNAME || form.get("password") !== PASSWORD) {
    return Response.json({ authenticated: false, code: -1, errors: { __all__: ["Wrong"] } });
  }
  return Response.json(
    { authenticated: true, code: 1, errors: {} },
    { headers: { "Set-Cookie": `newsblur_sessionid=${SESSION_ID}; Path=/; HttpOnly` } },
  );
};

const profileEndpoint = (call: OutboundCall): Response => {
  if (call.cookie !== `newsblur_sessionid=${SESSION_ID}`) return Response.json({}, { status: 403 });
  return Response.json({ code: 1, user_profile: { user_id: USER_ID } });
};

type WorkerServer = {
  url: string;
  ownerToken: string;
  privateKey: CryptoKey;
  outbound: OutboundCall[];
};

export const test = base.extend<
  { worker: WorkerServer; workerPassword: string },
  { bundle: string; keys: Keys }
>({
  // The password the Worker holds, so a test can make it differ from the NewsBlur account's.
  workerPassword: [PASSWORD, { option: true }],
  // Wrangler's own bundler, as the deploy uses; --dry-run stops before any upload.
  bundle: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads fixture deps from the pattern
    async ({}, use) => {
      const dir = await mkdtemp(join(tmpdir(), "lire-e2e-worker-"));
      await promisify(execFile)("yarn", ["wrangler", "deploy", "--dry-run", "--outdir", dir], {
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      });
      await use(join(dir, "worker.js"));
      await rm(dir, { recursive: true, force: true });
    },
    { scope: "worker", timeout: 60_000 },
  ],
  keys: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads fixture deps from the pattern
    async ({}, use) => {
      const { privateKey, publicKey } = await generateKeyPair("RS256");
      await use({ privateKey, publicJwk: { ...(await exportJWK(publicKey)), kid: KID } });
    },
    { scope: "worker" },
  ],
  // One Miniflare per test, so each starts signed out with in-memory storage.
  worker: async ({ bundle, keys, workerPassword }, use) => {
    const outbound: OutboundCall[] = [];
    const unexpected: string[] = [];
    const mf = new Miniflare({
      host: "127.0.0.1",
      port: 0,
      modules: true,
      scriptPath: bundle,
      // The bundle sits outside the repo, and workerd refuses module paths that climb out of it.
      modulesRoot: dirname(bundle),
      // Mirrors wrangler.toml.
      compatibilityDate: "2025-01-01",
      durableObjects: { NEWSBLUR_AUTH: { className: "NewsblurAuth", useSQLite: true } },
      bindings: {
        NEWSBLUR_HOST,
        NEWSBLUR_USERNAME: USERNAME,
        NEWSBLUR_PASSWORD: workerPassword,
        NEWSBLUR_NEWSLETTER_ADDRESS: "newsletters@newsblur.test",
        ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
        ACCESS_AUD: AUDIENCE,
        ACCESS_ALLOWED_EMAIL: OWNER,
      },
      outboundService: async (request: Request) => {
        if (request.url === `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`) {
          return Response.json({ keys: [keys.publicJwk] });
        }
        const endpoint = new URL(request.url);
        if (endpoint.origin === NEWSBLUR_HOST) {
          const call: OutboundCall = {
            url: request.url,
            body: await request.clone().text(),
            cookie: request.headers.get("Cookie"),
          };
          if (endpoint.pathname === "/api/login" && request.method === "POST") {
            outbound.push(call);
            return loginEndpoint(call);
          }
          if (endpoint.pathname === "/social/load_user_profile" && request.method === "GET") {
            outbound.push(call);
            return profileEndpoint(call);
          }
        }
        unexpected.push(`${request.method} ${request.url}`);
        return new Response("unexpected outbound fetch", { status: 599 });
      },
    });
    try {
      const url = (await mf.ready).origin;
      const ownerToken = await signAccessToken({ key: keys.privateKey });
      await use({ url, ownerToken, privateKey: keys.privateKey, outbound });
    } finally {
      await mf.dispose();
    }
    expect(unexpected, "unexpected outbound fetches").toEqual([]);
  },
});

export { expect };
