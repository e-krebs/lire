import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { Env } from "./env";

type AccessErrorCode = "misconfigured" | "missing_token" | "invalid_token" | "email_mismatch";

export class AccessError extends Error {
  readonly code: AccessErrorCode;

  constructor({ code, cause }: { code: AccessErrorCode; cause?: unknown }) {
    super(`Access denied (${code})`, { cause });
    this.name = "AccessError";
    this.code = code;
  }
}

type AccessEnv = Pick<Env, "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD" | "ACCESS_ALLOWED_EMAIL">;

// jose caches keys per set, so one set per team domain lives for the isolate's lifetime.
const remoteSets = new Map<string, JWTVerifyGetKey>();

const remoteJwks = (teamDomain: string): JWTVerifyGetKey => {
  let set = remoteSets.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    remoteSets.set(teamDomain, set);
  }
  return set;
};

export const verifyAccess = async ({
  request,
  env,
}: {
  request: Request;
  env: AccessEnv;
}): Promise<JWTPayload> => {
  // An empty audience would reach jose as "no audience check", so fail closed first.
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new AccessError({ code: "misconfigured" });

  // No CF_Authorization cookie fallback: the cookie rides cross-site requests.
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new AccessError({ code: "missing_token" });

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, remoteJwks(env.ACCESS_TEAM_DOMAIN), {
      audience: env.ACCESS_AUD,
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
    }));
  } catch (cause) {
    throw new AccessError({ code: "invalid_token", cause });
  }

  if (env.ACCESS_ALLOWED_EMAIL && payload.email !== env.ACCESS_ALLOWED_EMAIL) {
    throw new AccessError({ code: "email_mismatch" });
  }
  return payload;
};
