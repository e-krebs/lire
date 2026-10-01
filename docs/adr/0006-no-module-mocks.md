# 0006. No module mocks or spies, MSW and page.route only

## Status

Accepted

## Context

Module mocks and spies tie tests to import structure and implementation detail, so a refactor
breaks tests whose behavior did not change.

## Decision

Tests fake the network, not modules. Client unit and component tests use MSW, Worker tests stub the global `fetch`, and e2e uses
`page.route`.
The `vitest/no-restricted-vi-methods` rule in [.oxlintrc.json](../../.oxlintrc.json) bans
`vi.mock`, `doMock`, `unmock`, `doUnmock`, `mocked`, `importMock`, `hoisted` and `spyOn`, and each
message points at [testing](../reference/testing.md).

## Consequences

- Tests exercise the real module graph and survive refactors.
- Code needs seams at the network edge instead of injection points for mocks.
- The ban is enforced by lint, not by review.
- Detail: [tooling](../explanation/tooling.md).
