import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewsblurAuth } from "../newsblurAuth";

const TTL_MS = 180 * 24 * 60 * 60_000;

const auth = () =>
  env.NEWSBLUR_AUTH.get(env.NEWSBLUR_AUTH.idFromName(`user:${env.NEWSBLUR_USERNAME}`));

describe("NewsblurAuth tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a token it issued", async () => {
    const token = await auth().issueToken();
    expect(await auth().hasToken(token)).toBe(true);
  });

  it("issues a base64url token of 32 bytes", async () => {
    const token = await auth().issueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("refuses an unknown token", async () => {
    await auth().issueToken();
    expect(await auth().hasToken("not-issued")).toBe(false);
  });

  it("stores only a hash of the token", async () => {
    const token = await auth().issueToken();
    await runInDurableObject(auth(), (_instance: NewsblurAuth, state) => {
      const stored = JSON.stringify(state.storage.kv.get("tokens"));
      expect(stored).not.toContain(token);
    });
  });

  it("refuses a token after revoke and keeps the others", async () => {
    const revoked = await auth().issueToken();
    const kept = await auth().issueToken();
    await auth().revokeToken(revoked);
    expect(await auth().hasToken(revoked)).toBe(false);
    expect(await auth().hasToken(kept)).toBe(true);
  });

  it("refuses a token once it is past its 180 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const token = await auth().issueToken();
    vi.setSystemTime(Date.now() + TTL_MS);
    expect(await auth().hasToken(token)).toBe(false);
  });

  it("drops an expired token when a new one is issued", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const expired = await auth().issueToken();
    vi.setSystemTime(Date.now() + TTL_MS);
    await auth().issueToken();
    await runInDurableObject(auth(), (_instance: NewsblurAuth, state) => {
      const stored = state.storage.kv.get<{ hash: string }[]>("tokens") ?? [];
      expect(stored).toHaveLength(1);
    });
    expect(await auth().hasToken(expired)).toBe(false);
  });

  it("keeps the 20 newest tokens and drops the oldest", async () => {
    const tokens: string[] = [];
    for (let index = 0; index < 21; index += 1) {
      tokens.push(await auth().issueToken());
    }
    expect(await auth().hasToken(tokens[0])).toBe(false);
    for (const token of tokens.slice(1)) {
      expect(await auth().hasToken(token)).toBe(true);
    }
  });

  it("keeps tokens across setSession and clearSession", async () => {
    const token = await auth().issueToken();
    await auth().setSession({ kind: "cookie", sessionId: "session-1", userId: 42 });
    await auth().clearSession();
    expect(await auth().hasToken(token)).toBe(true);
  });

  it("keeps both tokens when two issues run at once", async () => {
    const [first, second] = await Promise.all([auth().issueToken(), auth().issueToken()]);
    expect(await auth().hasToken(first)).toBe(true);
    expect(await auth().hasToken(second)).toBe(true);
  });
});
