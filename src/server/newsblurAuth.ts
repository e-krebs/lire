import { DurableObject } from "cloudflare:workers";
import type { FeedsAnswer } from "shared/bff/upstream";
import type { Env } from "./env";

const TOKEN_KEY = "token";
const FEEDS_CACHE_KEY = "feedsCache";
const FEEDS_GENERATION_KEY = "feedsGeneration";
const FEEDS_CACHE_TTL_MS = 5 * 60_000;

export interface StoredToken {
  accessToken: string;
  // The NewsBlur user the token signed in as, checked against every read answer.
  userId: number;
}

type StoredFeedsCache = { value: FeedsAnswer; expiresAt: number };

export class NewsblurAuth extends DurableObject<Env> {
  hasToken(): boolean {
    return this.getToken() !== undefined;
  }

  getToken(): StoredToken | undefined {
    return this.ctx.storage.kv.get<StoredToken>(TOKEN_KEY);
  }

  // A cached feed list belongs to the account it was read with, so it goes with every token change.
  setToken(token: StoredToken): void {
    this.ctx.storage.kv.put(TOKEN_KEY, token);
    this.clearFeedsCache();
  }

  clearToken(): void {
    this.ctx.storage.kv.delete(TOKEN_KEY);
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

  private feedsGeneration(): number {
    return this.ctx.storage.kv.get<number>(FEEDS_GENERATION_KEY) ?? 0;
  }
}
