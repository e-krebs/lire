// oxlint-disable typescript/no-unnecessary-type-parameters, typescript/no-unsafe-type-assertion, typescript/require-await -- mirrors the Workers kv.get<T> signature and the async storage API, which the fake answers at once
export interface KvStorage {
  get<T>(key: string): T | undefined;
  put(key: string, value: unknown): void;
  delete(key: string): boolean;
}

export interface DurableObjectStorage {
  kv: KvStorage;
  transactionSync<T>(callback: () => T): T;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
  getAlarm(): Promise<number | null>;
  deleteAll(): Promise<void>;
}

export interface DurableObjectState {
  storage: DurableObjectStorage;
}

// A real Durable Object stores structured-cloneable values, so the fake clones on the way in and out.
export const createStorage = (): DurableObjectStorage => {
  const values = new Map<string, unknown>();
  let alarm: number | null = null;
  return {
    setAlarm: async (scheduledTime) => void (alarm = scheduledTime),
    deleteAlarm: async () => void (alarm = null),
    getAlarm: async () => alarm,
    deleteAll: async () => {
      values.clear();
      alarm = null;
    },
    transactionSync: (callback) => {
      const snapshot = structuredClone(values);
      try {
        return callback();
      } catch (error) {
        values.clear();
        for (const [key, value] of snapshot) values.set(key, value);
        throw error;
      }
    },
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
