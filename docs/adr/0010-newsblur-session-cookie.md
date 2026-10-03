# 0010. Sign in with the NewsBlur session cookie

## Status

Accepted.

## Context

NewsBlur offers an OAuth code flow, but a developer must email NewsBlur and wait for a client id
and secret. Its API also accepts the `newsblur_sessionid` cookie that `POST /api/login` returns. The
Worker already holds secrets, which suits a username and a password.

## Decision

The Worker holds `NEWSBLUR_USERNAME` and `NEWSBLUR_PASSWORD` as secrets and posts them to
`${NEWSBLUR_HOST}/api/login`. It keeps the `newsblur_sessionid` cookie and the NewsBlur user id in
the `NewsblurAuth` Durable Object, addressed by the name `singleton`, and sends the cookie on every
upstream call. A request that finds no stored session logs in first. A 401 or 403 from upstream, or
an answer for another user, makes a `GET` log in once more and retry. A write does not retry. If
the retry or the login fails, the Worker clears the session and answers `sign_in_required`. `GET /api/auth/login` runs the same login by hand and
redirects to `/`.

## Consequences

- The password is a full-account credential with no scope. It sits in GitHub and Worker secrets
  only.
- An account with no password cannot use `/api/login`.
- A password change breaks the Worker until CI redeploys the secret.
- The session never reaches the client.
- One account per deployment, by design.
- The cookie has no documented lifetime. The re-login on a rejection covers its expiry.
- Detail: [auth](../explanation/auth.md).
