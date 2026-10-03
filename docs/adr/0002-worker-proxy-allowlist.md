# 0002. Keep the feeds API behind a Worker with a path allowlist

## Status

Superseded by [0011](0011-newsblur-bff.md)

## Context

The browser app needs the feeds API, but the API credentials must never reach the client bundle,
and an open proxy would let a stolen session call any endpoint on the account.

## Decision

Every feeds API call goes through the Cloudflare Worker ([worker.ts](../../src/server/worker.ts)).
The Worker forwards a request only if its method and path match an entry of `ALLOWED_PATHS` in
`src/shared/feedsApi/paths.ts`, the list of endpoints the app uses. Anything else
is refused. The client and the Worker share that module, so the two cannot drift.

## Consequences

- A new endpoint is one line in `ALLOWED_PATHS`, reviewed like any code change.
- The matcher is pure string matching with no dependencies, so it is cheap to unit test.
- The access token stays server-side (see [0004](0004-pasted-refresh-token.md)).
- Detail: [architecture](../explanation/architecture.md).
