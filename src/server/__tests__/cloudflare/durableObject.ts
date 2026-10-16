// oxlint-disable typescript/no-unnecessary-type-parameters, typescript/no-unsafe-type-assertion -- mirrors the Workers kv.get<T> signature
export interface KvStorage {
  get<T>(key: string): T | undefined;
  put(key: string, value: unknown): void;
  delete(key: string): boolean;
}

export interface DurableObjectStorage {
  kv: KvStorage;
}

export interface DurableObjectState {
  storage: DurableObjectStorage;
}

// A real Durable Object stores structured-cloneable values, so the fake clones on the way in and out.
export const createStorage = (): DurableObjectStorage => {
  const values = new Map<string, unknown>();
  return {
    kv: {
      get: <T>(key: string) => {
        const value = values.get(key);
        return value === undefined ? undefined : (structuredClone(value) as T);
      },
      put: (key, value) => void values.set(key, structuredClone(value)),
      delete: (key) => values.delete(key),
    },
  };
};

export class DurableObject<Env = unknown> {
  readonly ctx: DurableObjectState;
  readonly env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
