import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../worker";

describe("worker access gate", () => {
  describe("when verifyAccess throws something other than an AccessError", () => {
    it("rethrows a failure that is not an AccessError", async () => {
      await expect(
        worker.fetch(new Request("https://lire.krebs.tech/api/auth/status"), {
          ...env,
          get ACCESS_TEAM_DOMAIN(): string {
            throw new Error("boom");
          },
        }),
      ).rejects.toThrow("boom");
    });
  });
});
