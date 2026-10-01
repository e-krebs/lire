# API

The Worker ([worker.ts](../../src/server/worker.ts)) answers only under `/api/`. Any other path
gets a 404. Every `/api/` request first passes the Access check.

## Routes

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/auth/status` | `{ signedIn }`, true when a refresh token is stored |
| GET | `/api/auth/login` | The sign-in page, with a CSRF cookie |
| POST | `/api/auth/login` | Checks origin and CSRF, stores the pasted refresh token, redirects to `/` |
| any | `/api/v3/*` | Proxy to the feeds API when the method and path match the allowlist, else 404 |

The proxy sends an `Authorization: OAuth <token>` header with an access token minted from the stored refresh token. On a 401 it refreshes
once and retries. Non-GET requests need a same-origin caller, and POST needs a JSON content type.
Errors are JSON: `forbidden`, `not_found`, `sign_in_required`, `upstream_unavailable`.

The allowlist is in [paths.ts](../../src/shared/feedsApi/paths.ts). The response and request types
are in [types.ts](../../src/shared/feedsApi/types.ts), with stream ids in
[streams.ts](../../src/shared/feedsApi/streams.ts).

## Environment

Names and roles only.

| Name | Kind | Role |
| --- | --- | --- |
| `VITE_API_MODE` | build | `real` targets the Worker, otherwise the fixtures |
| `VITE_FIXTURES` | build | `seed` forces the seed fixtures |
| `VITE_FIXTURE_LATENCY_MS` | build | Fixed fixture delay |
| `VITE_DEMO` | build | `true` makes the demo build |
| `FEEDLY_DEV_TOKEN` | local | Listed in [.env.sample](../../.env.sample) |
| `FEEDLY_HOST` | Worker var | Base URL of the feeds API |
| `FEEDLY_CLIENT_ID` | Worker var | Client id sent on the token refresh |
| `ACCESS_TEAM_DOMAIN` | Worker var | Access team domain that issues the JWT |
| `ACCESS_AUD` | Worker var | Expected JWT audience |
| `ACCESS_ALLOWED_EMAIL` | Worker secret | Owner email pin, set by CI from a GitHub secret |
| `FEEDLY_AUTH` | Worker binding | Durable Object namespace holding the refresh token |
| `E2E_COVERAGE` | test | `1` turns on Playwright coverage |
| `COVERAGE_DIR` | test | Output directory of the Vitest coverage scripts |

The Worker vars and binding are declared in [wrangler.toml](../../wrangler.toml) and typed in
[env.ts](../../src/server/env.ts).
