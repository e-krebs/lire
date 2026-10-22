# Auth

Two layers of auth guard the Worker. Cloudflare Access decides who may reach the Worker at all. A
NewsBlur OAuth grant, obtained by the reader signing in to NewsBlur, decides what the Worker may do
upstream ([ADR 0012](../adr/0012-newsblur-oauth.md)). A `lire_session` cookie, set by the sign-in,
names the browser that may call the Worker's `/api` routes.

## Layer 1: Cloudflare Access and the owner pin

Access sits in front of `lire.krebs.tech`. It runs the login, applies its policy, and adds a
signed JWT to each request it lets through. The Worker does not trust that the request passed
Access; it checks the JWT itself on every `/api/` request before any routing
([worker.ts](../../src/server/worker.ts#L285-L296)), and answers `403` on any failure.

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

That last check is the owner pin. The Access policy admits only the owner, but the policy lives in a
dashboard, and a broadened policy (a new rule, a group, a one-time PIN for a guest) would otherwise
reach the owner's session. The pin keeps the Worker's own idea of "the owner" in the Worker. Unset,
the Worker trusts the Access policy alone; a CI deploy fails without it. Access stays the gate on
who reaches the Worker until the owner-only policy is lifted; the OAuth sign-in itself accepts any
NewsBlur account.

## Layer 2: the NewsBlur OAuth grant

### The sign-in

The Worker holds the OAuth client id and secret as the `NEWSBLUR_OAUTH_CLIENT_ID` and
`NEWSBLUR_OAUTH_CLIENT_SECRET` secrets. The reader signs in through NewsBlur's authorization-code
flow:

1. `GET /api/auth/login` ([worker.ts](../../src/server/worker.ts)) stores a fresh `state` in the
   Durable Object for that state, valid for 10 minutes, and redirects to `${NEWSBLUR_HOST}/oauth/authorize`
   with the client id, the callback URL and that `state`. It also sets the `state` in the
   `lire_oauth_state` cookie, `HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`.
2. NewsBlur asks the reader to log in there and redirects to `GET /api/auth/callback` with a `code`
   and the `state`.
3. The callback accepts the `state` only when it matches the cookie and the Durable Object consumes
   it. A state is single-use, so a replayed callback fails. A callback with an `error` parameter or no
   `code` fails too.
4. The Worker exchanges the code at `/oauth/token` with the client secret. It reads the profile at
   `/social/load_user_profile` with the new access token, to learn the NewsBlur user id.
5. It stores the access token, the refresh token, the user id and the username in the Durable Object
   for that user, and sets the `lire_session` cookie. It answers `302` to `/`.

A failure at any step answers `400` with a short page that links back to `/api/auth/login`. The page
sets no `lire_session` cookie and clears the `state` cookie. The Worker logs the failed step and an
upstream status or error name (`wrangler tail` shows it), never a code or a token. The PWA service worker does not answer
`/api/` navigations (see [architecture.md](architecture.md#pwa)), so these routes always reach the Worker.

The worker's background sync of marks fetches `/api/auth/status` for the user id, then posts to
`/api/entries/mark` behind Access with the same cookie as the page. It does not follow redirects: an
expired Access session answers a cross-origin redirect, which counts as a retryable failure, and the
rows stay stored for the page to send after a new sign-in.

The page fetches the same way. An expired Access session answers a page fetch with a redirect to
the Access host, which sends no CORS header. `httpTransport` fetches with `redirect: "manual"` and
navigates to `/api/auth/login` on `opaqueredirect`, so Access runs its login. It does not reload,
because the service worker serves the cached shell for page loads and a reload never reaches
Access; `/api/` paths bypass the worker. A `sessionStorage` guard allows one navigation per minute.
Unsent read marks survive in IndexedDB. When the guard blocks, the reader sees the `SignIn` screen,
and its link runs Access again.

### The session cookie

The cookie is `lire_session=<userId>.<token>`, with `HttpOnly; Secure; SameSite=Lax; Path=/api;
Max-Age=15552000` (180 days). `<userId>` is the NewsBlur user id, which names the Durable Object, and
`<token>` is 32 random bytes in base64url. The Worker splits the value on its last dot. The user id
must be a positive integer, so the cookies of the earlier password login, keyed by username, read as
signed out. `Path=/api` keeps the cookie off the SPA's pages.

Each contract route reads the cookie before any upstream work. A missing or malformed cookie, or a
token the object does not hold, answers `401 sign_in_required`. A cookie with no stored NewsBlur
credential answers the same. `GET /api/auth/status` answers `200 { signedIn: false }` instead. A valid
cookie with a stored credential answers `200 { signedIn: true, userId }`, where `userId` is the
NewsBlur user id that tags each queued mark. A mark body whose `userId` is not the signed-in user
answers `409 user_mismatch`.

A sign-in with a valid cookie for the same user replaces that cookie's token, so one browser holds one
token. A browser with no cookie shows the SignIn screen.

### Sign-out

`POST /api/auth/logout` ([worker.ts](../../src/server/worker.ts)) applies the same-origin and JSON
checks, revokes the token that the cookie presents, clears the cookie with `Max-Age=0` and answers
`204`. A request without a cookie also answers `204`. Sign-out ends one browser's access. It leaves
the NewsBlur grant and the feed cache in the object, because the reader's other browsers use them.

The account menu's Sign out action runs this route from the page. It first flushes the mark queue,
waiting at most 3 seconds, then posts to the route. Only a `204` clears the queue, the IndexedDB
mark store and the query cache; a failed logout clears nothing and leaves the row as it is. The service worker
does not clear anything: it drops the rows of another user on its next sync.

### Session storage

The grant lives in one Durable Object, [NewsblurAuth](../../src/server/newsblurAuth.ts), addressed by
the NewsBlur user id ([worker.ts](../../src/server/worker.ts), `userObject`). Each NewsBlur user has
its own object, so two users' cookies reach only their own grants. The object stores
`{kind: "token", accessToken, refreshToken, userId, username, revision}` under one key in its
SQLite-backed storage. The Worker sends the access token as `Authorization: Bearer <accessToken>` on
each upstream call and never forwards it, or the cookie, to the client.

The same object holds the cache of the folder tree (see
[architecture.md](architecture.md#worker)). Storing or clearing the grant drops the cache.

The same object holds the browser tokens under one key. It stores the SHA-256 hash of each token,
with an expiry 180 days out, and never the token, so a read of the storage yields no usable cookie.
It keeps at most 20 live tokens: an issue drops expired ones first, then the oldest. Storing or
clearing the NewsBlur grant leaves the tokens alone.

### When NewsBlur rejects the access token

An upstream `401` on a `GET` makes the Worker refresh the grant once, with the `refresh_token` grant at
`/oauth/token`, and run the request again with the new access token. The object serializes refreshes
per user, and it stores the new token pair under a new revision. A refresh that finds a newer revision
already stored uses that one instead. A refresh answered `429` makes the Worker answer `429
rate_limited`. A refresh that NewsBlur rejects with `400` or `401` and `error: invalid_grant` clears the
stored grant, unless another request has already replaced it, and the request answers `401
sign_in_required`. Any other refresh failure (a network error, a `5xx`, an answer the Worker cannot
read) keeps the grant and answers `502 upstream_error`, so the next request can try again. A write is
never retried, because it may have partly landed before the rejection. A rejected write clears the
grant only after a refresh already in flight has finished, so it cannot clear the grant that refresh
just stored.

NewsBlur's read views do not always answer `401` on a bad token: they answer `200` with the data of a
fallback user. So `handle` also checks every read answer against the user id stored at sign-in, and a
mismatch is treated as a rejected session.

## CSRF checks

Access attaches its JWT to any request that carries the Access cookie, and the browser sends that
cookie on a cross-site form post too. A valid JWT alone therefore does not prove that the
reader's own page sent the request, so the Worker adds its own checks on every state-changing
call:

- [isSameOrigin](../../src/server/worker.ts#L145-L156) compares `Origin`, or `Referer` when
  `Origin` is absent, with the Worker's own origin. A request with neither fails.
- On the contract routes, every method other than `GET` must pass `isSameOrigin`, and a `POST` or
  `PATCH` must carry a JSON `Content-Type` ([worker.ts](../../src/server/worker.ts)). A cross-site
  HTML form cannot send `application/json`, so this closes the simple-request path. It is also why
  the client sends `{}` as the body of a bodiless POST.
- `POST /api/auth/logout` applies the same two checks as a contract route, and a cross-origin call
  answers `403` before it revokes anything.
- The callback is a `GET` that redeems a single-use `state`, so a cross-site request cannot complete
  a sign-in for the reader's browser: the `state` cookie of that browser is missing or does not match.
  A cross-site navigation to `/api/auth/login` only starts a new authorization and reads nothing back.

`GET /api/auth/status` and every other `GET` call change nothing, so they skip these checks.

## Limitations

- **Any NewsBlur account, one owner gate.** The sign-in accepts any NewsBlur account, but Access and
  the owner pin still admit only the owner's email to the Worker. Lifting that gate is a separate
  change.
- **Token lifetime.** The NewsBlur access and refresh tokens carry the lifetimes NewsBlur gives them.
  A refresh that NewsBlur rejects as `invalid_grant` signs the reader out, and the reader signs in
  again. A transient refresh failure keeps the reader signed in.
- **Cookie lifetime and rotation.** The `lire_session` cookie lasts 180 days, and its token expires
  with it. A sign-in for the same user replaces the token of the cookie it carries, which invalidates
  any other copy of that cookie. It is a nuisance, not a leak.
- **Grant at rest.** The access and refresh tokens sit in Durable Object storage in plain form,
  protected by Cloudflare's storage and by the Worker being their only reader. They are not encrypted
  with a key of the app's own. Browser tokens are stored only as SHA-256 hashes.
- **Credentials.** `NEWSBLUR_OAUTH_CLIENT_ID` and `NEWSBLUR_OAUTH_CLIENT_SECRET` are Worker secrets, set
  by CI from GitHub secrets. The client secret never reaches the client.
- **Pin is required for a CI deploy only.** The code treats the `ACCESS_ALLOWED_EMAIL` secret as
  optional, and a Worker deployed without it relies on the Access policy alone. CI fails both the
  Access check and the Worker deploy when the pin is unset.
- **Local Worker runs.** `yarn worker:dev` answers `403` to every `/api` request until a valid
  Access JWT arrives, so the Worker is checked live rather than locally.
