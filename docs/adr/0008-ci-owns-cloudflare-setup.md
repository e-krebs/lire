# 0008. CI deploys the Worker and owns the Cloudflare setup

## Status

Accepted

## Context

The Worker was deployed by hand with a `wrangler secret put` for the owner pin, and the Pages
projects, custom domains and DNS records were created in the dashboard. Each of those steps could
drift or be forgotten, and nothing checked that the Access application still matched the Worker.

## Decision

CI runs the Cloudflare setup on every push to `main`. A `preflight` job checks the Access
application ([check-access.ts](../../scripts/check-access.ts)) and creates any missing Pages
project, custom domain and DNS record ([provision-pages.ts](../../scripts/provision-pages.ts)). A
`deploy-worker` job deploys the Worker and passes the owner pin from a GitHub secret with
`--secrets-file`. A `check-live` job requests every host after the deploys
([check-live.ts](../../scripts/check-live.ts)). One `CLOUDFLARE_API_TOKEN` serves every job. The
Access application stays dashboard-managed; CI only checks it.

## Consequences

- One token carries wider scopes than a Pages-only token, with its zone permissions limited to
  `krebs.tech`. Scopes are listed in [deploy](../how-to/deploy.md).
- An unset `ACCESS_ALLOWED_EMAIL` fails the run, instead of silently leaving the Access policy as
  the only gate.
- Provisioning only creates. A conflicting DNS record fails the run and waits for the owner.
- A Worker change that breaks the e2e tests does not ship.
- Supersedes the manual Worker deploy described in [ADR 0003](0003-access-owner-pin.md)'s pin
  setup; its decision to pin the owner email stands.
- Detail: [tooling](../explanation/tooling.md).
