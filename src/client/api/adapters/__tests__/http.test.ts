import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "client/api/client";
import { createMarkReadQueue } from "client/api/markReadQueue";
import { markReadStore } from "client/api/markReadStore";

const redirected = () => ({
  type: "opaqueredirect",
  status: 0,
  text: async () => {
    await Promise.resolve();
    return "";
  },
});

const setup = async () => {
  vi.resetModules();
  const replace = vi.fn<(url: string) => void>();
  vi.stubGlobal("location", { origin: "http://localhost", replace });
  const fetchMock = vi.fn<(url: URL, init: RequestInit) => Promise<unknown>>();
  vi.stubGlobal("fetch", fetchMock);
  const { httpTransport } = await import("../http");
  return { replace, fetchMock, httpTransport };
};

const settledState = async (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(() => "settled"),
    new Promise((resolve) =>
      setTimeout(() => {
        resolve("pending");
      }, 0),
    ),
  ]);

const get = { method: "GET", path: "/api/counts" } as const;

describe("httpTransport", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("passes a JSON answer through with redirect manual", async () => {
    const { fetchMock, httpTransport, replace } = await setup();
    fetchMock.mockResolvedValue({
      type: "basic",
      status: 200,
      text: async () => {
        await Promise.resolve();
        return '{"a":1}';
      },
    });
    const response = await httpTransport(get);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ a: 1 });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual", cache: "no-store" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("goes to the login route once on an opaqueredirect and never settles", async () => {
    const { fetchMock, httpTransport, replace } = await setup();
    fetchMock.mockResolvedValue(redirected());
    expect(await settledState(httpTransport(get))).toBe("pending");
    expect(replace).toHaveBeenCalledExactlyOnceWith("/api/auth/login");
  });

  it("goes to the login route once for parallel opaqueredirects and settles none", async () => {
    const { fetchMock, httpTransport, replace } = await setup();
    fetchMock.mockResolvedValue(redirected());
    const states = await Promise.all([httpTransport(get), httpTransport(get)].map(settledState));
    expect(states).toEqual(["pending", "pending"]);
    expect(replace).toHaveBeenCalledExactlyOnceWith("/api/auth/login");
  });

  it("answers 401 without navigating within 60 s of a previous navigation", async () => {
    const first = await setup();
    first.fetchMock.mockResolvedValue(redirected());
    expect(await settledState(first.httpTransport(get))).toBe("pending");
    const { fetchMock, httpTransport, replace } = await setup();
    fetchMock.mockResolvedValue(redirected());
    const response = await httpTransport(get);
    expect(response.status).toBe(401);
    expect(await response.json()).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("navigates again after 60 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const first = await setup();
    first.fetchMock.mockResolvedValue(redirected());
    expect(await settledState(first.httpTransport(get))).toBe("pending");
    vi.setSystemTime(Date.now() + 61_000);
    const { fetchMock, httpTransport, replace } = await setup();
    fetchMock.mockResolvedValue(redirected());
    expect(await settledState(httpTransport(get))).toBe("pending");
    expect(replace).toHaveBeenCalledExactlyOnceWith("/api/auth/login");
  });

  it("still navigates when sessionStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { fetchMock, httpTransport, replace } = await setup();
    fetchMock.mockResolvedValue(redirected());
    expect(await settledState(httpTransport(get))).toBe("pending");
    expect(replace).toHaveBeenCalledExactlyOnceWith("/api/auth/login");
  });

  it("keeps the ids of a keepalive markRead in the store when the guard answers 401", async () => {
    sessionStorage.setItem("lire:access-login", String(Date.now()));
    const { fetchMock, httpTransport } = await setup();
    fetchMock.mockResolvedValue(redirected());
    const queue = createMarkReadQueue({
      send: async ({ entryIds, keepalive }) => {
        const response = await httpTransport({
          method: "POST",
          path: "/api/entries/read",
          body: { entryIds },
          keepalive,
        });
        if (response.status === 401) throw new ApiError({ status: 401, code: "sign_in_required" });
      },
    });
    const added = queue.add(["e1", "e2"]);
    await queue.flush({ keepalive: true });
    await added;
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: true });
    expect(await markReadStore.all()).toEqual(["e1", "e2"]);
  });
});
