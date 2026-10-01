# Fixtures

Mock mode serves every feeds API response from JSON files under `fixtures/`. The loader is
[fixture.ts](../../src/client/api/adapters/fixture.ts).

## Layout

| Directory | Content | Tracked |
| --- | --- | --- |
| `fixtures/seed/` | Synthetic responses, the layout and file naming in [its README](../../fixtures/seed/README.md) | yes |
| `fixtures/real/` | Responses recorded from a live account, same layout as the seed | no, gitignored |
| `fixtures/real-raw/` | Raw captures kept out of the repo | no, gitignored |

Recording writes `fixtures/real/` through [record-fixtures.ts](../../scripts/record-fixtures.ts).
The steps are in [../how-to/record-fixtures.md](../how-to/record-fixtures.md).

## Selection rule

The loader picks one source directory at module load
([fixture.ts:69-72](../../src/client/api/adapters/fixture.ts#L69-L72)):

- `real` when `fixtures/real/` is complete and `VITE_FIXTURES` is not `seed`
- `seed` otherwise

`fixtures/real/` is complete when it holds `profile.json`, `collections.json`,
`subscriptions.json`, `markers-counts.json` and at least one file under `streams/`. An incomplete
recording logs a warning and falls back to the seed. `search-feeds.json` is optional in `real/` and
falls back to the seed copy.

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
