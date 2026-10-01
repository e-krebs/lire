# 0005. Fixture-backed mock mode by default

## Status

Accepted

## Context

Development, e2e and the public demo must run without a live account, and recordings of a real
account hold personal data that must not enter the public repo.

## Decision

Mock mode is the default: only `VITE_API_MODE=real` targets the Worker
([client.ts](../../src/client/api/client.ts)). The fixture transport serves committed synthetic
data from `fixtures/seed/`. A recording in `fixtures/real/` takes over when complete, unless
`VITE_FIXTURES=seed` ([fixture.ts](../../src/client/api/adapters/fixture.ts)). `.gitignore` excludes the
`/fixtures/real*` directories.

## Consequences

- A fresh clone runs with no setup, and e2e is deterministic on the seed.
- Real builds drop the fixture chunk through the literal env compare in `client.ts`.
- The seed must be kept in step with the API shapes.
- Detail: [fixtures](../reference/fixtures.md).
