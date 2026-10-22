# 0012. Sign in to NewsBlur with OAuth, per user

## Status

Accepted.

## Context

The Worker needs a NewsBlur credential to call the upstream API for the signed-in reader. Its first
credential was the owner's NewsBlur username and password, posted to `/api/login` and kept as a
`newsblur_sessionid` cookie. That suited one owner account, but it made every deployment hold a
full-account password, and it tied the Worker to one account. NewsBlur also offers an OAuth
authorization-code flow, and a client id and secret now exist for Lire.

## Decision

The Worker runs the authorization-code flow. `GET /api/auth/login` redirects to NewsBlur's
`/oauth/authorize`, and `GET /api/auth/callback` exchanges the code at `/oauth/token`. The callback
reads the profile at `/social/load_user_profile` to learn the NewsBlur user id, then stores the
access and refresh tokens in the `NewsblurAuth` Durable Object for that user. The object is addressed
by the user id, so each NewsBlur user has its own session.

- The `lire_session` cookie names the user id and a browser token, `<userId>.<token>`. The Worker
  keeps only the SHA-256 hash of each token.
- The `state` value of the flow is a single-use cookie, `lire_oauth_state`, `HttpOnly; Secure;
  SameSite=Lax` with a 10-minute lifetime. The Worker stores it in its own Durable Object and
  consumes it on the callback, so a replayed or mismatched state fails.
- Upstream calls send `Authorization: Bearer <accessToken>`. The session cookie never leaves the
  browser.
- When NewsBlur rejects the access token on a `GET`, the Worker refreshes it once. The Durable Object
  serializes the refresh per user, and a write is never retried.
- The Worker's client secret, `NEWSBLUR_OAUTH_CLIENT_SECRET`, and client id are Worker secrets, set
  by CI.

## Consequences

- The Worker holds no NewsBlur password. A password change no longer breaks sign-in.
- The Worker holds a refresh token per user in Durable Object storage. The Worker is its only
  reader, and the browser never sees it.
- Any NewsBlur user can sign in. The Cloudflare Access policy and the owner email pin still decide
  who reaches the Worker, so the sign-in is open to others only once that gate changes.
- Cookies and stored sessions from the password login do not match the new keys, so every browser
  signs in again on its first visit after the change.
- A deployment needs the OAuth client id and secret as GitHub and Worker secrets before the Worker
  deploys.
- The session never reaches the client, and one browser token per cookie is kept, as before.
- Detail: [auth](../explanation/auth.md).
