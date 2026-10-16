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

export interface StoredCredential {
  kind: "cookie";
  sessionId: string;
  // The NewsBlur user the session signed in as, checked against every read answer.
  userId: number;
}

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

  // `onlySessionId` keeps a newer session that another request stored while this one failed.
  clearSession({ onlySessionId }: { onlySessionId?: string } = {}): void {
    if (onlySessionId !== undefined && this.getSession()?.sessionId !== onlySessionId) return;
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
