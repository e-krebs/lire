# 0004. A pasted refresh token in a singleton Durable Object, no OAuth redirect

## Status

Accepted

## Context

The feeds API issues a refresh token per account. A redirect-based OAuth flow would need a
registered client and a callback for an app with one user.

## Decision

The owner pastes a refresh token once. The Worker validates it by exchanging it for an access
token, and only then stores it in the `FeedlyAuth` Durable Object, addressed by the name
`singleton` ([feedlyAuth.ts](../../src/server/feedlyAuth.ts), [worker.ts](../../src/server/worker.ts)).
The object serializes refreshes into a single flight and serves cached access tokens until shortly
before expiry. A rejected paste leaves the working sign-in untouched.

## Consequences

- No redirect, callback or client secret in the app.
- One account per deployment, by design.
- When the provider rejects the refresh token, the owner pastes a new one (Re-auth).
- Detail: [auth](../explanation/auth.md).
