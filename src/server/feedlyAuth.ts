import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import type { Env } from "./env";

const REFRESH_SKEW_MS = 60_000;
const TOKENS_KEY = "tokens";

type StoredTokens = { refreshToken: string; accessToken?: string; expiresAt?: number };

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
});

type RefreshFailure = { ok: false; reason: "refresh_rejected" | "unavailable" };

export type AccessTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_signed_in" }
  | RefreshFailure;

export class FeedlyAuth extends DurableObject<Env> {
  readonly #refreshing = new Map<string, Promise<AccessTokenResult>>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  hasRefreshToken(): boolean {
    return this.#read() !== undefined;
  }

  clearTokens(): void {
    this.ctx.storage.kv.delete(TOKENS_KEY);
    this.#refreshing.clear();
  }

  // Validates the candidate before it replaces anything, so a bad paste keeps a working sign-in.
  async replaceRefreshToken(token: string): Promise<AccessTokenResult> {
    return this.#singleFlight({
      refreshToken: token,
      onTokens: (tokens) => {
        this.#write(tokens);
      },
    });
  }

  // A rejectedAccessToken that is no longer cached came from before a login, so the login's token
  // is served instead of refreshing it.
  async getAccessToken({
    rejectedAccessToken,
  }: { rejectedAccessToken?: string } = {}): Promise<AccessTokenResult> {
    const stored = this.#read();
    if (!stored) return { ok: false, reason: "not_signed_in" };

    const { refreshToken, accessToken, expiresAt } = stored;
    if (
      accessToken &&
      accessToken !== rejectedAccessToken &&
      expiresAt &&
      Date.now() < expiresAt - REFRESH_SKEW_MS
    ) {
      return { ok: true, token: accessToken };
    }

    // A login or clearTokens that landed mid-refresh wins over this result, success or rejection.
    const result = await this.#singleFlight({
      refreshToken,
      onTokens: (tokens) => {
        if (this.#read()?.refreshToken === refreshToken) this.#write(tokens);
      },
    });
    if (
      !result.ok &&
      result.reason === "refresh_rejected" &&
      this.#read()?.refreshToken === refreshToken
    ) {
      this.clearTokens();
    }
    return result;
  }

  // Awaits inside one request still interleave, so overlapping callers on the same refresh token
  // share one refresh instead of rotating it against each other.
  async #singleFlight({
    refreshToken,
    onTokens,
  }: {
    refreshToken: string;
    onTokens: (tokens: Required<StoredTokens>) => void;
  }): Promise<AccessTokenResult> {
    const inFlight = this.#refreshing.get(refreshToken);
    if (inFlight) return inFlight;

    const promise = this.#refresh(refreshToken)
      .then((result): AccessTokenResult => {
        if (!result.ok) return result;
        onTokens(result.tokens);
        return { ok: true, token: result.tokens.accessToken };
      })
      .finally(() => {
        if (this.#refreshing.get(refreshToken) === promise) this.#refreshing.delete(refreshToken);
      });
    this.#refreshing.set(refreshToken, promise);
    return promise;
  }

  async #refresh(
    refreshToken: string,
  ): Promise<{ ok: true; tokens: Required<StoredTokens> } | RefreshFailure> {
    const response = await fetch(`${this.env.FEEDLY_HOST}/v3/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.env.FEEDLY_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return {
        ok: false,
        reason: [400, 401, 403].includes(response.status) ? "refresh_rejected" : "unavailable",
      };
    }

    const body = tokenResponseSchema.parse(await response.json());
    return {
      ok: true,
      tokens: {
        refreshToken: body.refresh_token ?? refreshToken,
        accessToken: body.access_token,
        expiresAt: Date.now() + body.expires_in * 1000,
      },
    };
  }

  #read(): StoredTokens | undefined {
    return this.ctx.storage.kv.get<StoredTokens>(TOKENS_KEY);
  }

  #write(tokens: StoredTokens): void {
    this.ctx.storage.kv.put(TOKENS_KEY, tokens);
  }
}
