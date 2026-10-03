# 0010. Sign in with the NewsBlur OAuth code flow

## Status

Accepted.

## Context

NewsBlur offers an OAuth code flow and issues long-lived tokens, so the owner no longer has to paste
a credential by hand. The Worker already holds secrets, which suits a client secret.

## Decision

`/api/auth/login` sets a random `state` in an `HttpOnly; Secure; SameSite=Lax; Path=/api/auth`
cookie and redirects to `https://newsblur.com/oauth/authorize`. Lax lets the cookie come back on the
NewsBlur redirect. `/api/auth/callback` checks `state` and exchanges the code with the client
secret. The 10-year token sits in the `NewsblurAuth` Durable Object, addressed by the name
`singleton`. A 401 or 403 from upstream clears the token and answers `sign_in_required`, and the
owner signs in again.

## Consequences

- The app holds a client secret, `NEWSBLUR_CLIENT_SECRET`, as a Worker secret.
- The token never reaches the client.
- One account per deployment, by design.
- The `FeedlyAuth` class goes away through a migration that deletes it, because its stored refresh
  token has no use.
- Detail: [auth](../explanation/auth.md).
