# API

The Worker ([worker.ts](../../src/server/worker.ts)) answers only under `/api/`. Any other path
gets a 404. Every `/api/` request first passes the Access check. The routes are the Lire contract
in [routes.ts](../../src/shared/feedsApi/routes.ts), translated to NewsBlur by the core in
[src/shared/bff/](../../src/shared/bff/) ([ADR 0009](../adr/0009-newsblur-bff.md)).

## Sign-in routes

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/auth/login` | Sets the `lire_oauth_state` cookie and redirects to NewsBlur's `/oauth/authorize` |
| GET | `/api/auth/callback` | Checks `state`, exchanges the code, stores the token, redirects to `/`. A failure answers 400 with a page that links back to the login |

## Contract routes

Ids are opaque to the client: a feed id is the numeric NewsBlur id, a category id is the top-level
folder title, an entry id is the story hash. A stream key is `all`, `read`, `folder:<title>` or
`feed:<id>`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/auth/status` | `{ signedIn }`, true when a token is stored |
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
| GET | `/api/streams/:streamKey/entries` | `?count&unreadOnly&order=newest\|oldest&cursor`, answers `{ items, cursor? }` |
| GET | `/api/entries/:entryId` | One entry |
| POST | `/api/entries/read` | Mark read, body `{ entryIds }` |
| POST | `/api/entries/unread` | Mark unread, body `{ entryIds }` |
| GET | `/api/search/entries` | `?streamKey&q&count&unreadOnly&cursor`, answers `{ items, cursor? }` |
| GET | `/api/search/feeds` | `?q`, answers `[{ feedUrl, title, subscribers? }]` |
| GET | `/api/preferences` | The `lire.*` preferences, as a record of strings |
| POST | `/api/preferences` | A partial record. `null` deletes a key |
| GET | `/api/newsletter-address` | `{ emailAddress }`, 404 when `NEWSBLUR_NEWSLETTER_ADDRESS` is empty |

Preference keys are `lire.categoryOrder` and `lire.directOpen.<feedId>`
([preferences.ts](../../src/shared/feedsApi/preferences.ts)). The Worker rejects other keys with 400.

The Worker sends `Authorization: Bearer <token>` upstream. Non-GET requests need a same-origin
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
| `NEWSBLUR_CLIENT_ID` | Worker secret | OAuth client id sent on authorize and on the code exchange, set by CI from a GitHub secret |
| `NEWSBLUR_CLIENT_SECRET` | Worker secret | OAuth client secret, set by CI from a GitHub secret |
| `NEWSBLUR_NEWSLETTER_ADDRESS` | Worker secret | The newsletter address the app shows, set by CI from a GitHub secret |
| `ACCESS_TEAM_DOMAIN` | Worker var | Access team domain that issues the JWT |
| `ACCESS_AUD` | Worker var | Expected JWT audience |
| `ACCESS_ALLOWED_EMAIL` | Worker secret | Owner email pin, set by CI from a GitHub secret |
| `NEWSBLUR_AUTH` | Worker binding | Durable Object namespace holding the token and the feed-list cache |
| `E2E_COVERAGE` | test | `1` turns on Playwright coverage |
| `COVERAGE_DIR` | test | Output directory of the Vitest coverage scripts |

The Worker vars and binding are declared in [wrangler.toml](../../wrangler.toml) and typed in
[env.ts](../../src/server/env.ts).
