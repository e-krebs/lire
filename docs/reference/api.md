# API

The Worker ([worker.ts](../../src/server/worker.ts)) answers only under `/api/`. Any other path
gets a 404. Every `/api/` request first passes the Access check. When Access answers with a
redirect, the client navigates to `/api/auth/login` instead of reloading, because the service worker
serves the cached shell for page loads. The routes are the Lire contract in
[routes.ts](../../src/shared/feedsApi/routes.ts), translated to NewsBlur by the core in
[src/shared/bff/](../../src/shared/bff/) ([ADR 0009](../adr/0009-newsblur-bff.md)).

Every `/api/` response carries `Cache-Control: no-store`, and the client adapter reads with
`cache: "no-store"`, so no HTTP cache serves a stale list.

## Sign-in routes

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/auth/login` | Logs in to NewsBlur with the Worker's credentials, stores the session and redirects to `/`. A failure answers 400 with a page that links back to the login |

## Contract routes

Ids are opaque to the client: a feed id is the numeric NewsBlur id, a category id is the top-level
folder title, an entry id is the story hash. A stream key is `all`, `read`, `folder:<title>` or
`feed:<id>`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/auth/status` | `{ signedIn }`, true when a session is stored or a login succeeds |
| GET | `/api/profile` | `{ username, email? }` |
| GET | `/api/categories` | `[{ id, label, feedIds }]`, ordered by the `lire.categoryOrder` preference |
| POST | `/api/categories` | Create a category, body `{ label }`. 409 when a category already has the label |
| PATCH | `/api/categories/:categoryId` | Rename, body `{ label }`. 409 when another category has the label. Swaps the id in `lire.categoryOrder` |
| DELETE | `/api/categories/:categoryId` | Delete. `?moveTo=<id>` first moves its feeds to that category |
| GET | `/api/feeds` | `[{ id, title, siteUrl?, feedUrl?, iconUrl?, categoryIds, isNewsletter }]` |
| POST | `/api/feeds` | Subscribe, body `{ feedUrl, title?, categoryIds }` |
| PATCH | `/api/feeds/:feedId` | Rename or move, body `{ title?, categoryIds? }` |
| DELETE | `/api/feeds/:feedId` | Unsubscribe |
| GET | `/api/counts` | `{ all, feeds: { [feedId]: n }, categories: { [id]: n } }` |
| GET | `/api/streams/:streamKey/entries` | `?count&unreadOnly&order=newest\|oldest&cursor`, answers `{ items, cursor? }`. NewsBlur sends no end flag, so the cursor is left out on an empty page and on a page shorter than a full one: 6 stories for a feed, 12 for a river, or the `count` asked for. A read stream has no fixed page size, so it ends on an empty page only. Rivers pass `count` to NewsBlur as `limit`. A single feed has no `limit`, so the Worker chains `ceil(count / 6)` upstream pages of 6 per page. `count` is capped at 50: a larger value answers 400. The client sends `count` on desktop only: 24 for rivers (all, category, read), 12 for a single feed. Phone and tablet send none |
| GET | `/api/entries/:entryId` | One entry |
| POST | `/api/entries/read` | Mark read, body `{ entryIds }`. The client batches ids (5 ids or 10 s) and stores them until the call succeeds; the service worker sends the same body on a background sync. A retryable status (401, 403, 408, 429, 5xx) keeps the ids stored; any other 4xx drops them |
| POST | `/api/entries/unread` | Mark unread, body `{ entryIds }` |
| GET | `/api/search/entries` | `?streamKey&q&count&unreadOnly&cursor`, answers `{ items, cursor? }`. The client sends the same desktop `count` as for a stream |
| GET | `/api/search/feeds` | `?q`, answers `[{ feedUrl, title, subscribers? }]` |
| GET | `/api/preferences` | The `lire.*` preferences, as a record of strings |
| POST | `/api/preferences` | A partial record. `null` deletes a key |
| GET | `/api/newsletter-address` | `{ emailAddress }`, 404 when `NEWSBLUR_NEWSLETTER_ADDRESS` is empty |
| GET | `/api/sun` | `?tz=<IANA zone>`, answers `{ phase: day\|dusk, nextChangeAt }` from the Cloudflare position when its zone matches `tz`, else the zone's city |

`/api/sun` makes no NewsBlur call. A zone with no city (`UTC`, `Etc/*`, an unknown name) answers 404, and a malformed `tz` answers 400.

Preference keys are `lire.categoryOrder` and `lire.directOpen.<feedId>`
([preferences.ts](../../src/shared/feedsApi/preferences.ts)). The Worker rejects other keys with 400.

The Worker sends `Cookie: newsblur_sessionid=<id>` and `User-Agent: Lire` upstream. NewsBlur bans a request with no user agent. Non-GET requests need a same-origin
caller, and POST and PATCH need a JSON content type. Creates answer 201 with the resource, PATCH
answers 200, and deletes, marks and preference writes answer 204. Errors are JSON: `forbidden`,
`not_found`, `bad_request`, `conflict` (409), `sign_in_required` (401), `upstream_error` (502). The response and
request types are in [types.ts](../../src/shared/feedsApi/types.ts).

## Environment

Names and roles only.

| Name | Kind | Role |
| --- | --- | --- |
| `VITE_API_MODE` | build | `real` targets the Worker, otherwise the fixtures |
| `VITE_FIXTURES` | build | `seed` forces the seed fixtures |
| `VITE_FIXTURE_LATENCY_MS` | build | Fixed fixture delay |
| `VITE_DEMO` | build | `true` makes the demo build |
| `NEWSBLUR_USERNAME`, `NEWSBLUR_PASSWORD` | local | Recorder login, listed in [.env.sample](../../.env.sample) |
| `NEWSBLUR_HOST` | Worker var | Base URL of NewsBlur |
| `NEWSBLUR_USERNAME`, `NEWSBLUR_PASSWORD` | Worker secret | The login the Worker posts to NewsBlur, set by CI from GitHub secrets |
| `NEWSBLUR_NEWSLETTER_ADDRESS` | Worker secret | The newsletter address the app shows, set by CI from a GitHub secret |
| `ACCESS_TEAM_DOMAIN` | Worker var | Access team domain that issues the JWT |
| `ACCESS_AUD` | Worker var | Expected JWT audience |
| `ACCESS_ALLOWED_EMAIL` | Worker secret | Owner email pin, set by CI from a GitHub secret |
| `NEWSBLUR_AUTH` | Worker binding | Durable Object namespace holding the session cookie, the user id and the feed-list cache |
| `E2E_COVERAGE` | test | `1` turns on Playwright coverage |
| `COVERAGE_DIR` | test | Output directory of the Vitest coverage scripts |

The Worker vars and binding are declared in [wrangler.toml](../../wrangler.toml) and typed in
[env.ts](../../src/server/env.ts).
