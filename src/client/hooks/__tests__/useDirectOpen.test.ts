import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { getPreferences } from "client/api/client";
import { keys } from "client/api/queries";
import { directOpenKey } from "shared/feedsApi/preferences";
import { useDirectOpen, useSetDirectOpen } from "../useDirectOpen";

const FEED = "101";
const OTHER = "102";

const setup = () => {
  vi.stubEnv("VITE_API_MODE", "mock");
  resetFixtureState();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
};

const toggle = () => {
  const { client, wrapper } = setup();
  const { result } = renderHook(() => ({ on: useDirectOpen(FEED), set: useSetDirectOpen() }), {
    wrapper,
  });
  const set = async (on: boolean) => {
    act(() => {
      result.current.set(FEED, on);
    });
    await waitFor(() => {
      expect(client.isMutating()).toBe(0);
    });
  };
  return { result, set };
};

describe("directOpen", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reads the flag off the cached preferences bucket", () => {
    const { client, wrapper } = setup();
    client.setQueryData(keys.preferences, { [directOpenKey(FEED)]: "visit" });

    expect(renderHook(() => useDirectOpen(FEED), { wrapper }).result.current).toBe(true);
  });

  it("keeps feeds independent", () => {
    const { client, wrapper } = setup();
    client.setQueryData(keys.preferences, { [directOpenKey(FEED)]: "visit" });

    expect(renderHook(() => useDirectOpen(OTHER), { wrapper }).result.current).toBe(false);
  });

  it("reports a feed as off while the bucket has not landed yet", () => {
    const { wrapper } = setup();

    expect(renderHook(() => useDirectOpen(FEED), { wrapper }).result.current).toBe(false);
  });

  it("writes the flag to the account bucket and deletes it again", async () => {
    const { result, set } = toggle();

    await set(true);
    expect(result.current.on).toBe(true);
    expect((await getPreferences())[directOpenKey(FEED)]).toBe("visit");

    await set(false);
    expect(result.current.on).toBe(false);
    expect((await getPreferences())[directOpenKey(FEED)]).toBeUndefined();
  });

  it("keeps the mock bucket across a reload, unlike every other fixture mutation", async () => {
    const { set } = toggle();
    await set(true);
    const stored: unknown = JSON.parse(
      window.localStorage.getItem("lire.fixture.preferences.v2") ?? "{}",
    );
    expect(stored).toMatchObject({ [directOpenKey(FEED)]: "visit" });

    // A test reset forgets it, so the next case starts from the fixture again.
    resetFixtureState();
    expect(window.localStorage.getItem("lire.fixture.preferences.v2")).toBeNull();
    expect(await getPreferences()).not.toHaveProperty(directOpenKey(FEED));
  });

  it("touches no other key in the bucket", async () => {
    const { set } = toggle();
    const before = Object.keys(await getPreferences());

    await set(true);

    expect(Object.keys(await getPreferences())).toEqual([...before, directOpenKey(FEED)]);
  });

  it("leaves the bucket empty when a feed that was never flagged is turned off", async () => {
    const { result, set } = toggle();
    const before = Object.keys(await getPreferences());

    await set(false);

    expect(result.current.on).toBe(false);
    expect(Object.keys(await getPreferences())).toEqual(before);
  });
});
