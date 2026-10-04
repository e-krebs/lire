# 0005. Real and demo builds pass secret and recorded-profile gates before deploy

## Status

Accepted

## Context

The repo is public and ships a bundle that must carry no credentials. The demo build must also
carry nothing from the owner's recorded account.

## Decision

Two scripts gate the built output. [check-dist-secrets.ts](../../scripts/check-dist-secrets.ts)
scans `dist/` for named secret patterns and for committed env files. [check-demo-brand.ts](../../scripts/check-demo-brand.ts)
takes an optional directory (default `dist`) and fails on the recorded profile's id and email when `fixtures/real/profile.json` exists. It used to
also fail on the upstream brand name; that needle was dropped when the references left the repo, so
the name is no longer scanned for. CI
runs the secret gate on the real and demo builds and this gate on the demo build and on
`storybook-static` ([ci.yml](../../.github/workflows/ci.yml)). The deploy scripts run them before
upload. The public Storybook is covered by this gate only, since it carries no `VITE_` secrets.

## Consequences

- A leak fails the build instead of reaching production.
- The gate checks recorded profile values only, and the profile is gitignored, so in CI it checks
  nothing. It bites on a machine that holds the recording.
- The public Storybook gets the same profile guarantee as the demo, in CI and at deploy time,
  instead of relying on the dev-only loading of the recorded profile.
- New secret names must be added to the pattern list.
- Detail: [tooling](../explanation/tooling.md).
