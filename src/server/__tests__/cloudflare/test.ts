// oxlint-disable typescript/no-unsafe-type-assertion -- the fake stands in for platform types it only partly implements
import worker from "server/worker";
import { NewsblurAuth } from "server/newsblurAuth";
import type { Env } from "server/env";
import { createKvStorage, type DurableObjectState } from "./durableObject";

const WORKERS_ENV = {
  NEWSBLUR_HOST: "https://newsblur.com",
  ACCESS_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
  ACCESS_AUD: "test-aud",
  ACCESS_ALLOWED_EMAIL: "owner@example.com",
  NEWSBLUR_USERNAME: "owner",
  NEWSBLUR_PASSWORD: "test-password",
  NEWSBLUR_NEWSLETTER_ADDRESS: "demo-0000@newsletters.newsblur.com",
};

interface Entry {
  instance: NewsblurAuth;
  state: DurableObjectState;
}

const entries = new Map<string, Entry>();
const stubs = new WeakMap<object, Entry>();

const entryFor = ({ name }: { name: string }): Entry => {
  let entry = entries.get(name);
  if (!entry) {
    const state: DurableObjectState = { storage: { kv: createKvStorage() } };
    entry = { instance: new NewsblurAuth(state as never, env), state };
    entries.set(name, entry);
  }
  return entry;
};

// A stub call crosses an RPC boundary in production, so it is async and clones its arguments and result.
const createStub = ({ entry }: { entry: Entry }) => {
  const stub = new Proxy(
    {},
    {
      get:
        (_target, method: string) =>
        async (...args: unknown[]) => {
          const call = Reflect.get(entry.instance, method) as (...args: unknown[]) => unknown;
          return structuredClone(await call.apply(entry.instance, structuredClone(args)));
        },
    },
  );
  stubs.set(stub, entry);
  return stub;
};

const namespace = {
  idFromName: (name: string) => ({ name }),
  get: (id: { name: string }) => createStub({ entry: entryFor(id) }),
};

export const env = { ...WORKERS_ENV, NEWSBLUR_AUTH: namespace } as unknown as Env;

// Workers' Request carries the edge metadata as `cf`, which the platform's Request drops.
const toWorkerRequest = ({ input, init }: { input: RequestInfo | URL; init?: RequestInit }) => {
  const request = new Request(input, init);
  const { cf } = (init ?? {}) as { cf?: unknown };
  if (cf !== undefined) Object.defineProperty(request, "cf", { value: cf });
  return request as never;
};

export const SELF = {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
    worker.fetch(toWorkerRequest({ input, init }), env),
};

export const runInDurableObject = async <Result>(
  stub: object,
  callback: (instance: NewsblurAuth, state: DurableObjectState) => Result | Promise<Result>,
): Promise<Result> => {
  const entry = stubs.get(stub);
  if (!entry) throw new Error("runInDurableObject needs a stub from env.NEWSBLUR_AUTH.get()");
  return callback(entry.instance, entry.state);
};
