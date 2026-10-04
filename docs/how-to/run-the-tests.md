# Run the tests

Every check CI runs ([ci.yml](../../.github/workflows/ci.yml)) also runs locally with the scripts
below. For test style see [Testing](../reference/testing.md); for the machinery see
[Test infrastructure](../reference/test-infrastructure.md).

## One-time setup

Install the browsers that Playwright and the Storybook tests drive:

```sh
yarn playwright install chromium webkit
```

CI also passes `--with-deps` to install system libraries. Locally you only need that on a fresh
Linux machine.

## Unit and component tests

| Task | Command |
| --- | --- |
| Client and shared code | `yarn test` |
| Client with coverage | `yarn test:coverage` |
| Worker | `yarn test:worker` |
| Worker with coverage | `yarn test:worker:coverage` |
| Storybook stories | `yarn test:storybook` |
| Every export is covered | `yarn check:export-coverage` |

`yarn test:storybook` needs the Playwright Chromium install above.

## End-to-end tests

| Task | Command |
| --- | --- |
| All projects | `yarn test:e2e` |
| Desktop project with coverage | `yarn test:e2e:coverage` |

Both need the Playwright browsers installed. Reports land in `playwright-report/`.

## Locale and timezone

The tests pin both, so no setup is needed: Vitest sets `TZ=UTC` in `vitest.config.ts`, and
Playwright runs with locale `en-US` and timezone `UTC`. To run the French spec alone:

```sh
yarn test:e2e e2e/locale.spec.ts
```

To read the UI in French in Storybook, pick French in the toolbar's Locale menu.

## Type checks

| Task | Command |
| --- | --- |
| SPA | `yarn typecheck` |
| Worker | `yarn typecheck:worker` |
| Scripts | `yarn typecheck:node` |
| End-to-end tests | `yarn typecheck:e2e` |

## Lint, format and dead code

| Task | Command |
| --- | --- |
| Lint | `yarn lint` |
| Check formatting | `yarn format:check` |
| Fix lint and format | `yarn fix` |
| Unused files and exports | `yarn knip` |
| Same, production entry points only | `yarn knip:production` |

## Gates on a build

Run these after the matching build.

| Task | Command |
| --- | --- |
| No secrets or real fixtures in `dist/` | `yarn build` then `yarn check:secrets` |
| Real-mode build is clean | `VITE_API_MODE=real yarn build` then `VITE_API_MODE=real yarn check:secrets` |
| Demo carries no recorded profile value | `yarn build:demo` then `yarn check:demo` |

`yarn check:links` needs no build. It scans every markdown file in the repo, tracked or not, but
skips gitignored files.
