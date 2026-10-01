# Auth

Lire has one user, its owner, and two layers of auth. Cloudflare Access decides who may reach the
Worker at all. A refresh token for the feeds API, pasted once by the owner, decides what the
Worker may do upstream. There is no OAuth redirect flow: the owner copies a refresh token from a
signed-in session of the feeds API and pastes it into a form the Worker serves.

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

## Layer 2: the pasted refresh token

### The login form

`GET /api/auth/login` returns a small HTML form built by the Worker
([worker.ts](../../src/server/worker.ts#L41-L79)), not by the SPA. The form holds a password
field for the refresh token and a hidden CSRF token, and the response sets the same CSRF token in
an `HttpOnly`, `Secure`, `SameSite=Strict` cookie scoped to the login path. It is sent with
`Cache-Control: no-store`. The SPA's `SignIn` screen is just a link to this page, and the PWA
service worker is told not to answer it (see [architecture.md](architecture.md#pwa)).

`POST /api/auth/login` ([worker.ts](../../src/server/worker.ts#L99-L117)) checks the request
origin and the CSRF pair, trims the pasted token, and hands it to the Durable Object. On success
it redirects to `/`. On a rejected token it re-renders the form with an error and a `400`, or a
`503` when the feeds API is unavailable.

### Token storage and refresh

The tokens live in one Durable Object, [FeedlyAuth](../../src/server/feedlyAuth.ts), addressed by
the fixed name `singleton` ([worker.ts](../../src/server/worker.ts#L19)). One user means one
object, so every request in every isolate sees the same token state, and the refresh runs in one
place. The object stores the refresh token, the current access token and its expiry under one
key in its SQLite-backed storage.

- `replaceRefreshToken` refreshes with the candidate before it stores anything. A bad paste
  therefore keeps the current, working sign-in.
- `getAccessToken` serves the cached access token until one minute before it expires, then
  refreshes. A refresh that the upstream answers with `400`, `401` or `403` clears the stored
  tokens; any other failure is `unavailable` and keeps them, so an upstream outage does not sign
  the owner out.
- Overlapping callers on the same refresh token share one in-flight refresh. Awaits interleave
  even inside a Durable Object, and two parallel refreshes would rotate the token against each
  other and leave one of them holding a dead token.
- A login, or a clear, that lands while a refresh is in flight wins over the refresh result: the
  result is written only when the stored refresh token is still the one it started from.

### The one retry on a 401

When the upstream answers a proxied call with `401`, the Worker asks the Durable Object for a
fresh token, passing the rejected one, and sends the call once more
([worker.ts](../../src/server/worker.ts#L153-L164)). If the rejected token is no longer the cached
one, a login happened in between, and the object serves the login's token instead of refreshing.
A second `401` returns `sign_in_required` to the client without dropping the refresh token, since
the upstream has just accepted it. A refresh failure maps to `401 sign_in_required` or
`503 upstream_unavailable`.

## CSRF checks

Access attaches its JWT to any request that carries the Access cookie, and the browser sends that
cookie on a cross-site form post too. A valid JWT alone therefore does not prove that the
owner's own page sent the request, so the Worker adds its own checks on every state-changing
call:

- [isSameOrigin](../../src/server/worker.ts#L81-L92) compares `Origin`, or `Referer` when
  `Origin` is absent, with the Worker's own origin. A request with neither fails.
- The login post must pass `isSameOrigin`, and its form CSRF token must equal the cookie one in a
  constant-time compare ([worker.ts](../../src/server/worker.ts#L100-L107)).
- On the proxy, every method other than `GET` must pass `isSameOrigin`, and a `POST` must carry a
  JSON `Content-Type` ([worker.ts](../../src/server/worker.ts#L130-L136)). A cross-site HTML form
  cannot send `application/json`, so this closes the simple-request path. It is also why the
  client sends `{}` as the body of a bodiless POST.

`GET /api/auth/status` and proxied `GET` calls change nothing, so they skip these checks.

## Limitations

- **One user.** The singleton Durable Object holds one token set. A second user would need a key
  per Access identity and is out of scope.
- **Manual re-auth.** When the upstream revokes the refresh token, the SPA shows the sign-in
  screen and the owner pastes a new token. Nothing renews it without the owner.
- **No sign-out route.** The Worker exposes no endpoint that clears the stored tokens; the
  Durable Object clears them only when a refresh is rejected.
- **Tokens at rest.** The refresh token sits in Durable Object storage in plain form, protected by
  Cloudflare's storage and by the Worker being its only reader. It is not encrypted with a key of
  the app's own.
- **Pin is required for a CI deploy only.** The code treats the `ACCESS_ALLOWED_EMAIL` secret as
  optional, and a Worker deployed without it relies on the Access policy alone. CI fails both the
  Access check and the Worker deploy when the pin is unset.
- **Local Worker runs.** `yarn worker:dev` answers `403` to every `/api` request until a valid
  Access JWT arrives, so the Worker is checked live rather than locally.
