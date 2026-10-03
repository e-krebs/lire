# Auth

Lire has one user, its owner, and two layers of auth. Cloudflare Access decides who may reach the
Worker at all. A NewsBlur OAuth token, obtained once through the code flow, decides what the Worker
may do upstream ([ADR 0012](../adr/0012-newsblur-oauth.md)).

## Layer 1: Cloudflare Access and the owner pin

Access sits in front of `lire.krebs.tech`. It runs the login, applies its policy, and adds a
signed JWT to each request it lets through. The Worker does not trust that the request passed
Access; it checks the JWT itself on every `/api/` request before any routing
([worker.ts](../../src/server/worker.ts#L184-L195)), and answers `403` on any failure.

[verifyAccess](../../src/server/access.ts) does four things:

- It fails closed when `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is empty. An empty audience would
  reach `jose` as "no audience check", which would accept a JWT minted for any Access app on the
  team.
- It reads the JWT from the `Cf-Access-Jwt-Assertion` header only, with no fallback to the
  `CF_Authorization` cookie, because the cookie rides cross-site requests and the header does
  not.
- It verifies the signature against the team's JWKS, the audience against `ACCESS_AUD` and the
  issuer against the team domain. The JWKS set is cached per team domain for the isolate's life.
- When the `ACCESS_ALLOWED_EMAIL` secret is set, it rejects a JWT whose `email` claim differs.

That last check is the owner pin. The Access policy already admits only the owner, but the policy
lives in a dashboard, and a broadened policy (a new rule, a group, a one-time PIN for a guest)
would otherwise reach the owner's token. The pin keeps the Worker's own idea of "the owner" in
the Worker. Unset, the Worker trusts the Access policy alone; a CI deploy fails without it.

## Layer 2: the NewsBlur OAuth token

### The sign-in flow

The SPA's `SignIn` screen is a link to `GET /api/auth/login`, which the PWA service worker is told
not to answer (see [architecture.md](architecture.md#pwa)).

1. `/api/auth/login` ([worker.ts](../../src/server/worker.ts)) sets a random `lire_oauth_state`
   cookie and answers `302` to `${NEWSBLUR_HOST}/oauth/authorize` with `response_type=code`, the
   client id, the callback as `redirect_uri`, `scope=read write` and the same `state`. The cookie is
   `HttpOnly; Secure; SameSite=Lax; Path=/api/auth` and lives ten minutes. `Lax` lets the browser
   send it back on the top-level redirect from NewsBlur, which `Strict` would block.
2. NewsBlur asks the owner to approve, then redirects to `/api/auth/callback?code&state`.
3. The callback compares `state` with the cookie in a constant-time compare. It then posts the code
   and the `NEWSBLUR_CLIENT_SECRET` to `/oauth/token`, and reads the NewsBlur user id from
   `/social/load_user_profile` with the new token.
4. It stores the token and the user id in the Durable Object, clears the state cookie and redirects
   to `/`.

Any failure in the callback (a `state` mismatch, a refused exchange, a malformed answer) clears the
cookie and answers `400` with a short page that links back to `/api/auth/login`.

### Token storage

The token lives in one Durable Object, [NewsblurAuth](../../src/server/newsblurAuth.ts), addressed
by the fixed name `singleton` ([worker.ts](../../src/server/worker.ts)). One user means one object,
so every request in every isolate sees the same token. The object stores `{accessToken, userId}`
under one key in its SQLite-backed storage. The token is valid for ten years and has no refresh:
the Worker sends it as `Authorization: Bearer <token>` and never renews it.

The same object holds the cache of the folder tree (see
[architecture.md](architecture.md#worker)). Storing or clearing the token drops the cache.

### When NewsBlur rejects the token

An upstream `401` or `403` makes `handle` answer `401 sign_in_required`, and the Worker clears the
stored token. The next `/api/auth/status` answers `{signedIn: false}`, and the owner signs in
again.

NewsBlur's read views do not always answer `401` on a bad token: they answer `200` with the data of
a fallback user. So `handle` also checks every read answer against the user id stored at sign-in,
and a mismatch is treated as a rejected token.

## CSRF checks

Access attaches its JWT to any request that carries the Access cookie, and the browser sends that
cookie on a cross-site form post too. A valid JWT alone therefore does not prove that the
owner's own page sent the request, so the Worker adds its own checks on every state-changing
call:

- [isSameOrigin](../../src/server/worker.ts#L81-L92) compares `Origin`, or `Referer` when
  `Origin` is absent, with the Worker's own origin. A request with neither fails.
- On the contract routes, every method other than `GET` must pass `isSameOrigin`, and a `POST` or
  `PATCH` must carry a JSON `Content-Type` ([worker.ts](../../src/server/worker.ts)). A cross-site
  HTML form cannot send `application/json`, so this closes the simple-request path. It is also why
  the client sends `{}` as the body of a bodiless POST.
- The login and callback routes are `GET` redirects that change nothing until the callback, and the
  callback is protected by the `state` cookie instead.

`GET /api/auth/status` and every other `GET` call change nothing, so they skip these checks.

## Limitations

- **One user.** The singleton Durable Object holds one token. A second user would need a key per
  Access identity and is out of scope.
- **Manual re-auth.** When NewsBlur revokes the token, the SPA shows the sign-in screen and the
  owner signs in again. Nothing renews it without the owner.
- **No sign-out route.** The Worker exposes no endpoint that clears the stored token; it clears it
  only when NewsBlur rejects it.
- **Token at rest.** The token sits in Durable Object storage in plain form, protected by
  Cloudflare's storage and by the Worker being its only reader. It is not encrypted with a key of
  the app's own.
- **Client secret.** `NEWSBLUR_CLIENT_SECRET` is a Worker secret, set by CI from a GitHub secret.
  It never reaches the client.
- **Pin is required for a CI deploy only.** The code treats the `ACCESS_ALLOWED_EMAIL` secret as
  optional, and a Worker deployed without it relies on the Access policy alone. CI fails both the
  Access check and the Worker deploy when the pin is unset.
- **Local Worker runs.** `yarn worker:dev` answers `403` to every `/api` request until a valid
  Access JWT arrives, so the Worker is checked live rather than locally.
