# Auth

Lire has one user, its owner, and two layers of auth. Cloudflare Access decides who may reach the
Worker at all. A NewsBlur session cookie, obtained by logging in with the owner's credentials, decides what the
Worker may do upstream ([ADR 0010](../adr/0010-newsblur-session-cookie.md)).

## Layer 1: Cloudflare Access and the owner pin

Access sits in front of `lire.krebs.tech`. It runs the login, applies its policy, and adds a
signed JWT to each request it lets through. The Worker does not trust that the request passed
Access; it checks the JWT itself on every `/api/` request before any routing
([worker.ts](../../src/server/worker.ts#L190-L201)), and answers `403` on any failure.

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
would otherwise reach the owner's session. The pin keeps the Worker's own idea of "the owner" in
the Worker. Unset, the Worker trusts the Access policy alone; a CI deploy fails without it.

## Layer 2: the NewsBlur session cookie

### The login

The Worker holds the owner's NewsBlur username and password as the `NEWSBLUR_USERNAME` and
`NEWSBLUR_PASSWORD` secrets. It signs in without any browser step:

1. It posts both to `${NEWSBLUR_HOST}/api/login`. NewsBlur answers `authenticated: true` and sets
   the `newsblur_sessionid` cookie when the credentials are right.
2. It reads the NewsBlur user id from `/social/load_user_profile` with the new cookie.
3. It stores the cookie and the user id in the Durable Object.

Any `/api` request that finds no stored session runs this login first, so the owner never sees a
sign-in step while the credentials hold. `GET /api/auth/login`
([worker.ts](../../src/server/worker.ts)) runs the same login by hand and redirects to `/`. The
SPA's `SignIn` screen links to it and appears only when the login fails. A failure answers `400`
with a short page that links back to `/api/auth/login`. The PWA service worker is told not to
answer that route (see [architecture.md](architecture.md#pwa)). The worker's background sync of
marks posts to `/api/entries/mark` behind Access with the same cookie as the page. It does
not follow redirects: an expired Access session answers a cross-origin redirect, which counts as a
retryable failure, and the rows stay stored for the page to send after a new sign-in.

The page fetches the same way. An expired Access session answers a page fetch with a redirect to
the Access host, which sends no CORS header. `httpTransport` fetches with `redirect: "manual"` and
navigates to `/api/auth/login` on `opaqueredirect`, so Access runs its login. It does not reload,
because the service worker serves the cached shell for page loads and a reload never reaches
Access; `/api/` paths bypass the worker. A `sessionStorage` guard allows one navigation per minute.
Unsent read marks survive in IndexedDB. When the guard blocks, the reader sees the `SignIn` screen,
and its link runs Access again.

### Session storage

The session lives in one Durable Object, [NewsblurAuth](../../src/server/newsblurAuth.ts), addressed
by the fixed name `singleton` ([worker.ts](../../src/server/worker.ts)). One user means one object,
so every request in every isolate sees the same session. The object stores `{sessionId, userId}`
under one key in its SQLite-backed storage. The Worker sends the cookie as
`Cookie: newsblur_sessionid=<id>` on each upstream call and never forwards it to the client.

The same object holds the cache of the folder tree (see
[architecture.md](architecture.md#worker)). Storing or clearing the session drops the cache.

### When NewsBlur rejects the session

NewsBlur documents no cookie lifetime. An upstream `401` or `403` makes `handle` answer
`401 sign_in_required`. The Worker then logs in once more and runs the request again with the new
session. Only a `GET` retries, because a write may have partly landed before the rejection. If the
retry fails, or the login fails, the Worker clears the stored session, unless another request has
already stored a newer one, and answers `401 sign_in_required`. A request that has just logged in
does not log in a second time.

NewsBlur's read views do not always answer `401` on a bad session: they answer `200` with the data
of a fallback user. So `handle` also checks every read answer against the user id stored at login,
and a mismatch is treated as a rejected session.

## CSRF checks

Access attaches its JWT to any request that carries the Access cookie, and the browser sends that
cookie on a cross-site form post too. A valid JWT alone therefore does not prove that the
owner's own page sent the request, so the Worker adds its own checks on every state-changing
call:

- [isSameOrigin](../../src/server/worker.ts#L95-L106) compares `Origin`, or `Referer` when
  `Origin` is absent, with the Worker's own origin. A request with neither fails.
- On the contract routes, every method other than `GET` must pass `isSameOrigin`, and a `POST` or
  `PATCH` must carry a JSON `Content-Type` ([worker.ts](../../src/server/worker.ts)). A cross-site
  HTML form cannot send `application/json`, so this closes the simple-request path. It is also why
  the client sends `{}` as the body of a bodiless POST.
- The login route is a `GET` that only logs in with the Worker's own credentials and redirects
  home. A cross-site request can trigger a login but gains nothing, so it skips these checks.

`GET /api/auth/status` and every other `GET` call change nothing, so they skip these checks.

## Limitations

- **One user.** The singleton Durable Object holds one session. A second user would need a key per
  Access identity and is out of scope.
- **Password required.** `/api/login` needs a NewsBlur account with a password. An account that
  only signs in through a third party cannot use it.
- **Password changes.** A new NewsBlur password breaks the login until CI deploys the new secret.
- **No sign-out route.** The Worker exposes no endpoint that clears the stored session; it clears
  it only when NewsBlur rejects it.
- **Session at rest.** The cookie sits in Durable Object storage in plain form, protected by
  Cloudflare's storage and by the Worker being its only reader. It is not encrypted with a key of
  the app's own.
- **Credentials.** `NEWSBLUR_USERNAME` and `NEWSBLUR_PASSWORD` are Worker secrets, set by CI from
  GitHub secrets. The password has full account power and no scope. It never reaches the client.
- **Pin is required for a CI deploy only.** The code treats the `ACCESS_ALLOWED_EMAIL` secret as
  optional, and a Worker deployed without it relies on the Access policy alone. CI fails both the
  Access check and the Worker deploy when the pin is unset.
- **Local Worker runs.** `yarn worker:dev` answers `403` to every `/api` request until a valid
  Access JWT arrives, so the Worker is checked live rather than locally.
