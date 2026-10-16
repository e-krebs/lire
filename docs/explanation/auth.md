# Auth

Lire has one user, its owner, and two layers of auth. Cloudflare Access decides who may reach the
Worker at all. A NewsBlur session cookie, obtained by logging in with the owner's credentials, decides what the
Worker may do upstream ([ADR 0010](../adr/0010-newsblur-session-cookie.md)). A `lire_session`
cookie, set by the login, names the browser that may call the Worker's `/api` routes.

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

`GET /api/auth/login` ([worker.ts](../../src/server/worker.ts)) runs the login, stores the session,
issues a browser token, sets the `lire_session` cookie and redirects to `/`. Only this route sets the
cookie. A request without a valid cookie never reaches the login: it answers `401`, and the SPA shows
its `SignIn` screen, whose link runs this route. A failure answers `400` with a short page that links
back to `/api/auth/login` and sets no cookie. The PWA service worker is told not to
answer that route (see [architecture.md](architecture.md#pwa)). The worker's background sync of
marks fetches `/api/auth/status` for the user id, then posts to `/api/entries/mark` behind Access
with the same cookie as the page. It does
not follow redirects: an expired Access session answers a cross-origin redirect, which counts as a
retryable failure, and the rows stay stored for the page to send after a new sign-in.

The page fetches the same way. An expired Access session answers a page fetch with a redirect to
the Access host, which sends no CORS header. `httpTransport` fetches with `redirect: "manual"` and
navigates to `/api/auth/login` on `opaqueredirect`, so Access runs its login. It does not reload,
because the service worker serves the cached shell for page loads and a reload never reaches
Access; `/api/` paths bypass the worker. A `sessionStorage` guard allows one navigation per minute.
Unsent read marks survive in IndexedDB. When the guard blocks, the reader sees the `SignIn` screen,
and its link runs Access again.

### The session cookie

The cookie is `lire_session=<userKey>.<token>`, with `HttpOnly; Secure; SameSite=Lax; Path=/api;
Max-Age=15552000` (180 days). `<userKey>` is the NewsBlur username, which names the Durable Object,
and `<token>` is 32 random bytes in base64url. The Worker splits the value on its last dot, because
a username may hold dots and a token holds none. `Path=/api` keeps the cookie off the SPA's pages.

Each contract route reads the cookie before any upstream work. A missing or malformed cookie, a user
key that is not the owner's, or a token the object does not hold answers `401 sign_in_required`, and
a key that is not the owner's answers before any object lookup, so a forged key creates no object.
`GET /api/auth/status` answers `200 { signedIn: false }` instead. A valid cookie answers
`200 { signedIn: true, userId }`, where `userId` is the NewsBlur user id that tags each queued mark.
Only a cookie that passes this check
reaches the stored session, and only then does the Worker log in upstream when no session is stored.

A login with a valid cookie replaces that cookie's token, so one browser holds one token. A browser
with no cookie, as every browser is until its first login after the cookie was introduced, shows the
SignIn screen.

### Sign-out

`POST /api/auth/logout` ([worker.ts](../../src/server/worker.ts)) applies the same-origin and JSON
checks, revokes the token that the cookie presents, clears the cookie with `Max-Age=0` and answers
`204`. A request without a cookie also answers `204`. Sign-out ends one browser's access. It leaves
the NewsBlur session and the feed cache in the object, because the owner's other browsers use them.

The account menu's Sign out action runs this route from the page. It first flushes the mark queue,
waiting at most 3 seconds, then posts to the route. Only a `204` clears the queue, the IndexedDB
mark store and the query cache; a failed logout clears nothing and leaves the row as it is. The service worker
does not clear anything: it drops the rows of another user on its next sync.

### Session storage

The session lives in one Durable Object, [NewsblurAuth](../../src/server/newsblurAuth.ts), addressed
by the NewsBlur username ([worker.ts](../../src/server/worker.ts), `userObject`). One NewsBlur
account means one object, so every request in every isolate sees the same session. The object
stores `{kind: "cookie", sessionId, userId}` under one key in its SQLite-backed storage. The Worker sends the cookie as
`Cookie: newsblur_sessionid=<id>` on each upstream call and never forwards it to the client.

The same object holds the cache of the folder tree (see
[architecture.md](architecture.md#worker)). Storing or clearing the session drops the cache.

The same object holds the browser tokens under one key. It stores the SHA-256 hash of each token,
with an expiry 180 days out, and never the token, so a read of the storage yields no usable cookie.
It keeps at most 20 live tokens: an issue drops expired ones first, then the oldest. Storing or
clearing the NewsBlur session leaves the tokens alone.

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

- [isSameOrigin](../../src/server/worker.ts#L145-L156) compares `Origin`, or `Referer` when
  `Origin` is absent, with the Worker's own origin. A request with neither fails.
- On the contract routes, every method other than `GET` must pass `isSameOrigin`, and a `POST` or
  `PATCH` must carry a JSON `Content-Type` ([worker.ts](../../src/server/worker.ts)). A cross-site
  HTML form cannot send `application/json`, so this closes the simple-request path. It is also why
  the client sends `{}` as the body of a bodiless POST.
- `POST /api/auth/logout` applies the same two checks as a contract route, and a cross-origin call
  answers `403` before it revokes anything.
- The login route is a `GET` that only logs in with the Worker's own credentials and redirects
  home. A cross-site request can trigger a login and rotate the cookie, but it reads nothing, so it
  skips these checks.

`GET /api/auth/status` and every other `GET` call change nothing, so they skip these checks.

## Limitations

- **One account.** The Durable Object for a NewsBlur account holds one session. A second account would need its own object, and a second user would need a key per
  Access identity and is out of scope.
- **Password required.** `/api/login` needs a NewsBlur account with a password. An account that
  only signs in through a third party cannot use it.
- **Password changes.** A new NewsBlur password breaks the login until CI deploys the new secret.
- **Cookie lifetime and rotation.** The `lire_session` cookie lasts 180 days, and its token expires
  with it. A cross-site navigation to `/api/auth/login` logs in upstream and replaces the token of
  the cookie it carries, which invalidates any other copy of that cookie. It is a nuisance, not a
  leak.
- **Session at rest.** The NewsBlur session cookie sits in Durable Object storage in plain form,
  protected by Cloudflare's storage and by the Worker being its only reader. It is not encrypted
  with a key of the app's own. Browser tokens are stored only as SHA-256 hashes.
- **Credentials.** `NEWSBLUR_USERNAME` and `NEWSBLUR_PASSWORD` are Worker secrets, set by CI from
  GitHub secrets. The password has full account power and no scope. It never reaches the client.
- **Pin is required for a CI deploy only.** The code treats the `ACCESS_ALLOWED_EMAIL` secret as
  optional, and a Worker deployed without it relies on the Access policy alone. CI fails both the
  Access check and the Worker deploy when the pin is unset.
- **Local Worker runs.** `yarn worker:dev` answers `403` to every `/api` request until a valid
  Access JWT arrives, so the Worker is checked live rather than locally.
