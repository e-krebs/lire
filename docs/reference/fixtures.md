# Fixtures

Mock mode answers from JSON files under `fixtures/`. Each file is the body of one NewsBlur answer.
The loader ([fixture.ts](../../src/client/api/adapters/fixture.ts)) hands them to
`createFakeNewsblur` ([fakeNewsblur.ts](../../src/client/api/adapters/fakeNewsblur.ts)), an
in-memory stand-in for NewsBlur that answers every upstream call the shared core
([src/shared/bff/](../../src/shared/bff/)) makes. The core turns those answers into the Lire
contract, as it does in the Worker. The fake keeps read state and folder changes in memory and pages
stories by `page`.

## Layout

| Directory | Content | Tracked |
| --- | --- | --- |
| `fixtures/seed/` | Synthetic NewsBlur answers, the layout and file naming in [its README](../../fixtures/seed/README.md) | yes |
| `fixtures/real/` | Answers recorded from a live account, same layout as the seed | no, gitignored |
| `fixtures/real-raw/` | Raw captures kept out of the repo | no, gitignored |

The layout, one file per upstream call, is:

| File | Upstream call |
| --- | --- |
| `profile.json` | `/social/load_user_profile` |
| `feeds.json` | `/reader/feeds` |
| `refresh_feeds.json` | `/reader/refresh_feeds`, the unread counts |
| `stories/<feedId>.json` | `/reader/feed/<feedId>`, a list of stories |
| `read_stories.json` | `/reader/read_stories` |
| `feed_autocomplete.json` | `/rss_feeds/feed_autocomplete` |
| `preferences.json` | `/profile/get_preference` |

Recording writes `fixtures/real/` through [record-fixtures.ts](../../scripts/record-fixtures.ts).
The steps are in [../how-to/record-fixtures.md](../how-to/record-fixtures.md).

## Selection rule

The loader picks one source directory at module load
([fixture.ts](../../src/client/api/adapters/fixture.ts)):

- `real` when `fixtures/real/` is complete and `VITE_FIXTURES` is not `seed`
- `seed` otherwise

`fixtures/real/` is complete when it holds `profile.json`, `feeds.json`, `refresh_feeds.json` and at
least one `stories/<feedId>.json`. An incomplete recording logs a warning and falls back to the
seed. The other files are optional in `real/` and fall back to the seed copy, or to an empty answer.

`real/` is globbed only when `import.meta.env.DEV` is true, so a production build never bundles it.

## Variables

| Variable | Role |
| --- | --- |
| `VITE_API_MODE` | `real` sends requests to the Worker. Any other value reads the fixtures. |
| `VITE_FIXTURES` | `seed` forces the seed even when a complete recording exists. |
| `VITE_FIXTURE_LATENCY_MS` | Fixed fixture delay in milliseconds. The client Vitest project sets it to `0`. |

## Forced seed

Tests assert seed ids and counts, so they never read a recording:

- the client Vitest project sets `VITE_FIXTURES=seed` in [vitest.config.ts](../../vitest.config.ts)
- the Playwright `webServer` entries set it in [playwright.config.ts](../../playwright.config.ts)
- the demo build sets it in `build:demo` ([package.json](../../package.json))
