import { QueryObserver } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from "vitest";
import { server } from "test/msw";
import { keys } from "client/api/keys";
import { markQueue } from "client/api/markQueue";
import { queryClient } from "client/api/queryClient";
import { signOut } from "client/api/signOut";

const LOGOUT_PATH = "*/api/auth/logout";

describe("signOut", () => {
  let logout: Mock<() => void>;
  let flush: MockInstance<typeof markQueue.flush>;
  let clear: MockInstance<typeof markQueue.clear>;

  beforeEach(() => {
    logout = vi.fn<() => void>();
    queryClient.setQueryData(keys.authStatus, { signedIn: true, userId: 7 });
    flush = vi.spyOn(markQueue, "flush").mockResolvedValue(undefined);
    clear = vi.spyOn(markQueue, "clear").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  describe("when the logout succeeds", () => {
    beforeEach(() => {
      server.use(
        http.post(LOGOUT_PATH, () => {
          logout();
          return new HttpResponse(null, { status: 204 });
        }),
      );
    });

    it("flushes, logs out, then clears the queue and the cache", async () => {
      await signOut();

      expect(flush.mock.invocationCallOrder[0]).toBeLessThan(logout.mock.invocationCallOrder[0]);
      expect(logout.mock.invocationCallOrder[0]).toBeLessThan(clear.mock.invocationCallOrder[0]);
      expect(queryClient.getQueryData(keys.authStatus)).toEqual({ signedIn: false });
    });

    it("logs out even when the flush fails", async () => {
      flush.mockRejectedValue(new Error("offline"));

      await signOut();

      expect(logout).toHaveBeenCalledOnce();
    });

    it("tells the mounted status observer that the user is signed out", async () => {
      const observer = new QueryObserver(queryClient, {
        queryKey: keys.authStatus,
        enabled: false,
      });
      const unsubscribe = observer.subscribe(() => {});

      await signOut();

      expect(observer.getCurrentResult().data).toEqual({ signedIn: false });
      unsubscribe();
    });
  });

  describe.each([
    ["a 403", () => new HttpResponse(null, { status: 403 })],
    ["a 500", () => new HttpResponse(null, { status: 500 })],
    ["a network failure", () => HttpResponse.error()],
  ])("when the logout fails with %s", (_, respond) => {
    beforeEach(() => {
      server.use(http.post(LOGOUT_PATH, respond));
    });

    it("throws and clears nothing", async () => {
      await expect(signOut()).rejects.toBeInstanceOf(Error);

      expect(clear).not.toHaveBeenCalled();
      expect(queryClient.getQueryData(keys.authStatus)).toEqual({ signedIn: true, userId: 7 });
    });
  });
});
