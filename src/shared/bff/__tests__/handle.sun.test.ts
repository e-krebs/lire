import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle } from "../handle";
import { matchRoute } from "shared/feedsApi/routes";
import { SunPhaseSchema } from "shared/feedsApi/types";
import { fakeUpstream, memoryCache } from "test/bffHarness";

type Geo = { lat: number; lon: number; timezone: string };

const sun = async ({ url, geo }: { url: string; geo?: Geo }) => {
  const parsed = new URL(url, "https://lire.test");
  const match = matchRoute({ method: "GET", pathname: parsed.pathname });
  if (!match) throw new Error(`no route for ${url}`);
  const upstream = fakeUpstream({});
  const response = await handle({
    route: match.route,
    params: match.params,
    query: parsed.searchParams,
    body: undefined,
    upstream: upstream.fetch,
    config: { newsletterAddress: "", userId: 1, geo },
    cache: memoryCache(),
  });
  expect(upstream.calls).toEqual([]);
  return response;
};

const phaseOf = async ({ url, geo }: { url: string; geo?: Geo }) =>
  SunPhaseSchema.parse((await sun({ url, geo })).body).phase;

describe("handle sun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the geo position when its time zone matches", async () => {
    // 12:00Z is midday in Paris but the middle of the night at lon -150.
    const geo = { lat: 20, lon: -150, timezone: "Europe/Paris" };
    expect(await phaseOf({ url: "/api/sun?tz=Europe/Paris", geo })).toBe("dusk");
  });

  it("falls back to the table when the geo time zone differs", async () => {
    const geo = { lat: 20, lon: -150, timezone: "Pacific/Honolulu" };
    const response = await sun({ url: "/api/sun?tz=Europe/Paris", geo });
    expect(response.status).toBe(200);
    expect(SunPhaseSchema.parse(response.body).phase).toBe("day");
  });

  it("answers an alias time zone from the table", async () => {
    expect((await sun({ url: "/api/sun?tz=Asia/Calcutta" })).status).toBe(200);
  });

  it("answers the next change as an ISO date after now", async () => {
    const { nextChangeAt } = SunPhaseSchema.parse(
      (await sun({ url: "/api/sun?tz=Europe/Paris" })).body,
    );
    expect(new Date(nextChangeAt).getTime()).toBeGreaterThan(Date.now());
  });

  it.for(["UTC", "Mars/Olympus", "constructor"])("answers 404 for %s", async (tz) => {
    expect(await sun({ url: `/api/sun?tz=${tz}` })).toEqual({
      status: 404,
      body: { error: "not_found" },
    });
  });

  it.for(["/api/sun", "/api/sun?tz=a%20b", `/api/sun?tz=${"a".repeat(65)}`])(
    "answers 400 for %s",
    async (url) => {
      expect((await sun({ url })).status).toBe(400);
    },
  );
});
