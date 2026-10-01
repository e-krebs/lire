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
// Access team or feeds API.
const TEAM_DOMAIN = "access.test";
const FEEDLY_HOST = "https://api.test";
const AUDIENCE = "lire-e2e";
export const OWNER = "owner@example.com";
export const CLIENT_ID = "test-client";
export const GOOD_REFRESH_TOKEN = "refresh-accepted";
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
type OutboundCall = { url: string; body: string };

const tokenEndpoint = async (request: Request): Promise<Response> => {
  const refreshToken = new URLSearchParams(await request.clone().text()).get("refresh_token");
  if (refreshToken !== GOOD_REFRESH_TOKEN) return Response.json({}, { status: 400 });
  return Response.json({ access_token: "access-e2e", expires_in: 3600 });
};

type WorkerServer = {
  url: string;
  ownerToken: string;
  privateKey: CryptoKey;
  outbound: OutboundCall[];
};

export const test = base.extend<{ worker: WorkerServer }, { bundle: string; keys: Keys }>({
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
  worker: async ({ bundle, keys }, use) => {
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
      durableObjects: { FEEDLY_AUTH: { className: "FeedlyAuth", useSQLite: true } },
      bindings: {
        FEEDLY_HOST,
        FEEDLY_CLIENT_ID: CLIENT_ID,
        ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
        ACCESS_AUD: AUDIENCE,
        ACCESS_ALLOWED_EMAIL: OWNER,
      },
      outboundService: async (request: Request) => {
        if (request.url === `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`) {
          return Response.json({ keys: [keys.publicJwk] });
        }
        if (request.url === `${FEEDLY_HOST}/v3/auth/token` && request.method === "POST") {
          outbound.push({ url: request.url, body: await request.clone().text() });
          return tokenEndpoint(request);
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
