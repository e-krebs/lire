# 0003. Cloudflare Access plus an owner email pin as the outer layer

## Status

Accepted

## Context

Lire is a single-user app, but its Worker holds a live account token. The Worker needs an
authentication layer that does not depend on app code the owner has to maintain.

## Decision

Cloudflare Access fronts the deployment. The Worker verifies the `Cf-Access-Jwt-Assertion` JWT
against the team's JWKS, with audience and issuer checks ([access.ts](../../src/server/access.ts)).
When the `ACCESS_ALLOWED_EMAIL` secret is set, the token's email must match it, so a policy
widened by mistake in the Access dashboard still admits only the owner. A missing team domain or
audience fails closed. The `CF_Authorization` cookie is not a fallback, since it rides cross-site
requests. `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are vars in [wrangler.toml](../../wrangler.toml);
the pin is a secret. [ADR 0008](0008-ci-owns-cloudflare-setup.md) moves setting it into CI.

## Consequences

- No login UI or session store to build.
- Tests sign their own Access JWTs against a local key set. Local dev runs in mock mode without
  the Worker. The Worker is only checked live.
- Detail: [auth](../explanation/auth.md).
