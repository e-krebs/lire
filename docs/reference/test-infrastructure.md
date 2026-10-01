# Test infrastructure

The machinery behind the tests. Test style is in [testing.md](testing.md).

## Vitest

[vitest.config.ts](../../vitest.config.ts) defines three projects.

| Project | Script | Environment | Includes |
| --- | --- | --- | --- |
| `client` | `yarn test` | jsdom | `src/{client,shared}/**/__tests__/**/*.test.{ts,tsx}` |
| `server` | `yarn test:worker` | Workers pool | `src/server/**/__tests__/**/*.test.ts` |
| `storybook` | `yarn test:storybook` | Chromium via Playwright | the stories |

The `client` project sets `VITE_FIXTURES=seed` and `VITE_FIXTURE_LATENCY_MS=0`
([fixtures.md](fixtures.md)).

### Shared setup in `src/test/`

| File | Role |
| --- | --- |
| [setup.ts](../../src/test/setup.ts) | Starts MSW, runs cleanup, restores timers, `localStorage` and the `HTMLElement` prototype after each test |
| [msw.ts](../../src/test/msw.ts) | MSW server with baseline handlers over the seed fixtures |
| [fixtureBackend.ts](../../src/test/fixtureBackend.ts) | Serves `fixtureTransport` over MSW at `/api` |
| [renderApp.tsx](../../src/test/renderApp.tsx) | Renders the app with a memory router and a query client |
| [advanceTimers.ts](../../src/test/advanceTimers.ts) | `advance`, fake timers wrapped in `act` |
| [seedCategories.ts](../../src/test/seedCategories.ts) | Seed category id and URL key by label |

### Worker pool

The `server` project runs through `cloudflareTest` with [wrangler.toml](../../wrangler.toml) and
binds `ACCESS_ALLOWED_EMAIL` for the tests. Tests are in
[src/server/__tests__](../../src/server/__tests__).

### Storybook

[.storybook/](../../.storybook/main.ts) holds the config. [fixtures.ts](../../.storybook/fixtures.ts)
exports seed-based story data and [decorators.tsx](../../.storybook/decorators.tsx) the shared
decorators. [preview.tsx](../../.storybook/preview.tsx) sets `a11y.test` to `error`. Stories live in
`src/**/__stories__/`, and the Storybook plugin filter drops the app-only Vite plugins.

## Playwright

[playwright.config.ts](../../playwright.config.ts) defines seven projects.

| Project | Server | Specs |
| --- | --- | --- |
| `pixel-9-pro` | `yarn dev` on 3000, seed | all but the own-server specs |
| `ipad-air-4` | same | same |
| `desktop` | same | same |
| `states` | dev server on 3001, real mode | `states.spec.ts` |
| `demo` | dev server on 3002, demo build flags | `demo.spec.ts` |
| `pwa` | build and preview on 3003, `dist-e2e` | `pwa.spec.ts` |
| `login` | none, one Miniflare per test | `login.spec.ts` |

| File | Role |
| --- | --- |
| [global-setup.ts](../../e2e/global-setup.ts) | Loads every route once per server, and clears stale coverage |
| [global-teardown.ts](../../e2e/global-teardown.ts) | Writes the e2e coverage report |
| [fixtures.ts](../../e2e/fixtures.ts) | Extended `test` that collects JS coverage on `desktop`; holds the report options |
| [support/worker.ts](../../e2e/support/worker.ts) | Bundles the Worker with `wrangler deploy --dry-run`, runs it in Miniflare, signs Access JWTs, stubs outbound fetches |

## Coverage

| Script | Provider | Output |
| --- | --- | --- |
| `yarn test:coverage` | v8, client and shared | `coverage/client` |
| `yarn test:worker:coverage` | istanbul, server | `coverage/server` |
| `yarn test:e2e:coverage` | Playwright and monocart, `desktop` only | `coverage/e2e` |

`COVERAGE_DIR` overrides the Vitest output directory. Per-file thresholds are 80% for statements,
lines and functions, and 100% for everything under `src/server/`.

[check-export-coverage.ts](../../scripts/check-export-coverage.ts) (`yarn check:export-coverage`)
reads the Vitest coverage reports and flags exported functions that no test calls.
