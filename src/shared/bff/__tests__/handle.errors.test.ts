import { describe, expect, it } from "vitest";
import { fakeUpstream, send, USER_ID } from "test/bffHarness";

const profile = async (reply: unknown) =>
  send({ url: "/api/profile", upstream: fakeUpstream({ "GET /social/load_user_profile": reply }) });

const SIGN_IN = { status: 401, body: { error: "sign_in_required" } };
const UPSTREAM = { status: 502, body: { error: "upstream_error" } };

describe("handle errors", () => {
  it("maps upstream 401 and 403 to sign_in_required", async () => {
    expect(await profile(new Response(null, { status: 401 }))).toEqual(SIGN_IN);
    expect(await profile(new Response(null, { status: 403 }))).toEqual(SIGN_IN);
  });

  it("maps other upstream errors to 502", async () => {
    expect(await profile(new Response(null, { status: 500 }))).toEqual(UPSTREAM);
    expect(await profile(new Response("<html>", { status: 200 }))).toEqual(UPSTREAM);
    expect(await profile({ user_profile: {} })).toEqual(UPSTREAM);
    expect(await send({ url: "/api/profile", upstream: fakeUpstream({}) })).toEqual(UPSTREAM);
  });

  it("answers sign_in_required when NewsBlur served another user", async () => {
    const answer = { user_profile: { username: "demo" } };
    expect(await profile(Response.json({ ...answer, authenticated: false }))).toEqual(SIGN_IN);
    expect(
      await profile(Response.json({ ...answer, authenticated: true, user_id: USER_ID + 1 })),
    ).toEqual(SIGN_IN);
    expect(await profile(Response.json(answer))).toEqual({
      status: 200,
      body: { username: "demo" },
    });
  });

  it("rethrows a failure that is not an answer", async () => {
    const cache = {
      get: async () => Promise.reject(new Error("storage down")),
      set: async () => Promise.resolve(),
      clear: async () => Promise.resolve(),
    };
    await expect(send({ url: "/api/feeds", upstream: fakeUpstream({}), cache })).rejects.toThrow(
      "storage down",
    );
  });
});
