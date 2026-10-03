import { DurableObject } from "cloudflare:workers";
import type { FeedsAnswer } from "shared/bff/upstream";
import type { Env } from "./env";

const SESSION_KEY = "session";
const FEEDS_CACHE_KEY = "feedsCache";
const FEEDS_GENERATION_KEY = "feedsGeneration";
const FEEDS_CACHE_TTL_MS = 5 * 60_000;

export interface StoredSession {
  sessionId: string;
  // The NewsBlur user the session signed in as, checked against every read answer.
  userId: number;
}

type StoredFeedsCache = { value: FeedsAnswer; expiresAt: number };

export class NewsblurAuth extends DurableObject<Env> {
  hasSession(): boolean {
    return this.getSession() !== undefined;
  }

  getSession(): StoredSession | undefined {
    return this.ctx.storage.kv.get<StoredSession>(SESSION_KEY);
  }

  // A cached feed list belongs to the account it was read with, so it goes with every session change.
  setSession(session: StoredSession): void {
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

  private feedsGeneration(): number {
    return this.ctx.storage.kv.get<number>(FEEDS_GENERATION_KEY) ?? 0;
  }
}
