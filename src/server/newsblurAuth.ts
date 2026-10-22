import { z } from "zod";
import { DurableObject } from "cloudflare:workers";
import type { FeedsAnswer } from "shared/bff/upstream";
import type { Env } from "./env";

const SESSION_KEY = "session";
const FEEDS_CACHE_KEY = "feedsCache";
const FEEDS_GENERATION_KEY = "feedsGeneration";
const FEEDS_CACHE_TTL_MS = 5 * 60_000;
const TOKENS_KEY = "tokens";
const TOKEN_TTL_MS = 180 * 24 * 60 * 60_000;
const MAX_TOKENS = 20;
const STATE_TTL_MS = 600_000;

export const OAuthTokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});

const InvalidGrantSchema = z.object({ error: z.literal("invalid_grant") });

export interface StoredCredential {
  kind: "token";
  accessToken: string;
  refreshToken: string;
  userId: number;
  username: string;
  revision: string;
}

// undefined means the grant is gone: NewsBlur answered invalid_grant, or the session was cleared.
type RefreshResult = StoredCredential | "rate_limited" | "transient" | undefined;

type StoredFeedsCache = { value: FeedsAnswer; expiresAt: number };

type StoredToken = { hash: string; expiresAt: number };

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const newToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export class NewsblurAuth extends DurableObject<Env> {
  private refreshing?: Promise<RefreshResult>;

  async createState(): Promise<void> {
    const expires = Date.now() + STATE_TTL_MS;
    this.ctx.storage.kv.put("state", expires);
    await this.ctx.storage.setAlarm(expires);
  }

  async consumeState(): Promise<boolean> {
    const expires = this.ctx.storage.kv.get<number>("state");
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    return expires !== undefined && expires > Date.now();
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  async signIn({
    credential,
    previousToken,
  }: {
    credential: StoredCredential;
    previousToken?: string;
  }): Promise<string> {
    const token = newToken();
    const hash = await sha256Hex(token);
    const previousHash = previousToken === undefined ? undefined : await sha256Hex(previousToken);
    this.ctx.storage.transactionSync(() => {
      this.setSession(credential);
      const now = Date.now();
      this.ctx.storage.kv.put(
        TOKENS_KEY,
        [
          ...this.liveTokens(now).filter((stored) => stored.hash !== previousHash),
          { hash, expiresAt: now + TOKEN_TTL_MS },
        ].slice(-MAX_TOKENS),
      );
    });
    return token;
  }

  async refreshSession({ revision }: { revision: string }): Promise<RefreshResult> {
    const current = this.getSession();
    if (!current || current.revision !== revision) return current;
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refreshCredential(current);
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = undefined;
    }
  }

  private async refreshCredential(current: StoredCredential): Promise<RefreshResult> {
    try {
      const response = await fetch(new URL("/oauth/token", this.env.NEWSBLUR_HOST), {
        method: "POST",
        headers: { "User-Agent": "Lire" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: current.refreshToken,
          client_id: this.env.NEWSBLUR_OAUTH_CLIENT_ID,
          client_secret: this.env.NEWSBLUR_OAUTH_CLIENT_SECRET,
        }),
      });
      if (this.getSession()?.revision !== current.revision) return this.getSession();
      if (response.status === 429) return "rate_limited";
      if (!response.ok) {
        const rejected = response.status === 400 || response.status === 401;
        return rejected && InvalidGrantSchema.safeParse(await response.json()).success
          ? undefined
          : "transient";
      }
      const tokens = OAuthTokenSchema.parse(await response.json());
      if (this.getSession()?.revision !== current.revision) return this.getSession();
      const fresh: StoredCredential = {
        ...current,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        revision: crypto.randomUUID(),
      };
      this.setSession(fresh);
      return fresh;
    } catch {
      return "transient";
    }
  }

  hasSession(): boolean {
    return this.getSession() !== undefined;
  }

  getSession(): StoredCredential | undefined {
    return this.ctx.storage.kv.get<StoredCredential>(SESSION_KEY);
  }

  // A cached feed list belongs to the account it was read with, so it goes with every session change.
  setSession(session: StoredCredential): void {
    this.ctx.storage.kv.put(SESSION_KEY, session);
    this.clearFeedsCache();
  }

  // A failed request must not clear a newer credential, and waits out a refresh that may replace it.
  async clearSession({ onlyRevision }: { onlyRevision?: string } = {}): Promise<void> {
    if (this.refreshing) await this.refreshing;
    if (onlyRevision !== undefined && this.getSession()?.revision !== onlyRevision) return;
    this.ctx.storage.kv.delete(SESSION_KEY);
    this.clearFeedsCache();
  }

  getFeedsCache(): { value: FeedsAnswer | undefined; generation: number } {
    const cached = this.ctx.storage.kv.get<StoredFeedsCache>(FEEDS_CACHE_KEY);
    const fresh = cached && Date.now() < cached.expiresAt;
    return { value: fresh ? cached.value : undefined, generation: this.feedsGeneration() };
  }

  setFeedsCache({ value, generation }: { value: FeedsAnswer; generation: number }): void {
    if (generation !== this.feedsGeneration()) return;
    this.ctx.storage.kv.put(FEEDS_CACHE_KEY, {
      value,
      expiresAt: Date.now() + FEEDS_CACHE_TTL_MS,
    } satisfies StoredFeedsCache);
  }

  clearFeedsCache(): void {
    this.ctx.storage.kv.put(FEEDS_GENERATION_KEY, this.feedsGeneration() + 1);
    this.ctx.storage.kv.delete(FEEDS_CACHE_KEY);
  }

  // The hash is awaited before storage is touched, so the read-change-write below has no await in it.
  async issueToken(): Promise<string> {
    const token = newToken();
    const hash = await sha256Hex(token);
    const now = Date.now();
    const tokens = [...this.liveTokens(now), { hash, expiresAt: now + TOKEN_TTL_MS }];
    this.ctx.storage.kv.put(TOKENS_KEY, tokens.slice(-MAX_TOKENS));
    return token;
  }

  async hasToken(token: string): Promise<boolean> {
    const hash = await sha256Hex(token);
    return this.liveTokens(Date.now()).some((stored) => stored.hash === hash);
  }

  async revokeToken(token: string): Promise<void> {
    const hash = await sha256Hex(token);
    this.ctx.storage.kv.put(
      TOKENS_KEY,
      this.liveTokens(Date.now()).filter((stored) => stored.hash !== hash),
    );
  }

  private liveTokens(now: number): StoredToken[] {
    const stored = this.ctx.storage.kv.get<StoredToken[]>(TOKENS_KEY) ?? [];
    return stored.filter((token) => token.expiresAt > now);
  }

  private feedsGeneration(): number {
    return this.ctx.storage.kv.get<number>(FEEDS_GENERATION_KEY) ?? 0;
  }
}
