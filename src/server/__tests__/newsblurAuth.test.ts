import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewsblurAuth } from "../newsblurAuth";

const TTL_MS = 180 * 24 * 60 * 60_000;

const auth = () => env.NEWSBLUR_AUTH.get(env.NEWSBLUR_AUTH.idFromName("user-id:42"));
const oauthState = (state: string) =>
  env.NEWSBLUR_AUTH.get(env.NEWSBLUR_AUTH.idFromName(`oauth:${state}`));

describe("NewsblurAuth tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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
    await auth().setSession({
      kind: "token",
      accessToken: "session-1",
      refreshToken: "refresh-1",
      userId: 42,
      username: "owner",
      revision: "session-1",
    });
    await auth().clearSession();
    expect(await auth().hasToken(token)).toBe(true);
  });

  it("keeps both tokens when two issues run at once", async () => {
    const [first, second] = await Promise.all([auth().issueToken(), auth().issueToken()]);
    expect(await auth().hasToken(first)).toBe(true);
    expect(await auth().hasToken(second)).toBe(true);
  });

  const credential = {
    kind: "token",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    userId: 42,
    username: "owner",
    revision: "old-revision",
  } as const;

  describe("when a login state is issued", () => {
    it("consumes a state once and drops its storage and alarm", async () => {
      await oauthState("state-once").createState();
      await runInDurableObject(oauthState("state-once"), (_instance, state) => {
        expect(state.storage.kv.get("state")).toEqual(expect.any(Number));
      });
      expect(await oauthState("state-once").consumeState()).toBe(true);
      expect(await oauthState("state-once").consumeState()).toBe(false);
      await runInDurableObject(oauthState("state-once"), (_instance, state) => {
        expect(state.storage.kv.get("state")).toBeUndefined();
      });
      await runInDurableObject(oauthState("state-once"), async (_instance, state) => {
        expect(await state.storage.getAlarm()).toBeNull();
      });
    });

    it("drops an abandoned state when its alarm fires", async () => {
      await oauthState("state-abandoned").createState();
      await runInDurableObject(oauthState("state-abandoned"), async (instance) => {
        await instance.alarm();
      });
      await runInDurableObject(oauthState("state-abandoned"), (_instance, state) => {
        expect(state.storage.kv.get("state")).toBeUndefined();
      });
      expect(await oauthState("state-abandoned").consumeState()).toBe(false);
    });
  });

  describe("when refreshing credentials", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("coalesces concurrent refreshes and reuses the new revision", async () => {
      await auth().setSession(credential);
      const fetch = vi.fn<() => Response>(() =>
        Response.json({ access_token: "new-access", refresh_token: "new-refresh" }),
      );
      vi.stubGlobal("fetch", fetch);
      const [first, second] = await Promise.all([
        auth().refreshSession({ revision: credential.revision }),
        auth().refreshSession({ revision: credential.revision }),
      ]);
      expect(first).toEqual(second);
      expect(first).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh" });
      expect(await auth().refreshSession({ revision: credential.revision })).toEqual(first);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("does not refresh a missing session", async () => {
      await auth().clearSession();
      expect(await auth().refreshSession({ revision: "absent" })).toBeUndefined();
    });

    it.each(["network", "invalid json", "invalid tokens"])(
      "keeps the grant on a %s failure during refresh",
      async (failure) => {
        await auth().setSession(credential);
        vi.stubGlobal("fetch", () => {
          if (failure === "network") throw new Error("offline");
          return failure === "invalid json"
            ? new Response("invalid")
            : Response.json({ access_token: "" });
        });
        expect(await auth().refreshSession({ revision: credential.revision })).toBe("transient");
        expect(await auth().getSession()).toEqual(credential);
      },
    );

    it.each([
      [400, '{"error":"invalid_grant"}', undefined],
      [401, '{"error":"invalid_grant"}', undefined],
      [400, '{"error":"invalid_client"}', "transient"],
      [401, "unauthorized", "transient"],
      [500, '{"error":"invalid_grant"}', "transient"],
    ])("answers %i with %s during refresh as %s", async (status, body, expected) => {
      await auth().setSession(credential);
      vi.stubGlobal("fetch", () => new Response(body, { status }));
      expect(await auth().refreshSession({ revision: credential.revision })).toBe(expected);
    });

    it("waits for an in-flight refresh before a rejected write clears the session", async () => {
      await auth().setSession(credential);
      let answer!: (response: Response) => void;
      const answered = new Promise<Response>((resolve) => {
        answer = resolve;
      });
      vi.stubGlobal("fetch", async () => {
        const response = await answered;
        return response;
      });
      const refreshing = auth().refreshSession({ revision: credential.revision });
      const cleared = auth().clearSession({ onlyRevision: credential.revision });
      answer(Response.json({ access_token: "new-access", refresh_token: "new-refresh" }));
      await Promise.all([refreshing, cleared]);
      expect(await auth().getSession()).toMatchObject({ accessToken: "new-access" });
    });

    it.each(["fetch", "body"])("keeps a newer sign-in during refresh %s", async (phase) => {
      await auth().setSession(credential);
      const newer = { ...credential, accessToken: "new-login", revision: "new-login" };
      vi.stubGlobal("fetch", async () => {
        if (phase === "fetch") await auth().setSession(newer);
        const response = Response.json({ access_token: "refreshed", refresh_token: "rotated" });
        if (phase === "body")
          vi.spyOn(response, "json").mockImplementation(async () => {
            await auth().setSession(newer);
            return { access_token: "refreshed", refresh_token: "rotated" };
          });
        return response;
      });
      expect(await auth().refreshSession({ revision: credential.revision })).toEqual(newer);
      expect(await auth().getSession()).toEqual(newer);
    });
  });
});
