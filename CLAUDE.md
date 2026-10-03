# Lire — agent instructions

Documentation lives in [docs/](docs/) — [docs/README.md](docs/README.md) is the map;
[README.md](README.md) is the entry point.

## Keep docs in sync with the code

`docs/` is a living deliverable, not a one-time writeup. When a change alters observable behavior, a
public interface, an invariant, or an operational fact, **update the affected doc in the same
change** — code that drifts its docs is incomplete. Writing conventions for the docs (quadrant
choice, voice, links/anchors, ADR format) live in the **`diataxis-docs` skill**
([.claude/skills/diataxis-docs/SKILL.md](.claude/skills/diataxis-docs/SKILL.md)).

Code touched → doc to check (update if the change is user- or reader-visible):

| Code area | Type | Doc to check |
|---|---|---|
| `src/server/**` (Worker, Durable Object, Access pin, refresh-token auth) | explanation; reference | [docs/explanation/auth.md](docs/explanation/auth.md); [docs/explanation/architecture.md](docs/explanation/architecture.md); [docs/reference/api.md](docs/reference/api.md) |
| `src/shared/feedsApi/**` (client↔Worker contract) | reference; explanation; adr | [docs/reference/api.md](docs/reference/api.md); [docs/reference/glossary.md](docs/reference/glossary.md); [docs/explanation/architecture.md](docs/explanation/architecture.md); [docs/adr/0009-newsblur-bff.md](docs/adr/0009-newsblur-bff.md) |
| `src/client/api/**`, `fixtures/**`, `.env.sample` (adapters, seed and recorded fixtures, env vars) | reference | [docs/reference/fixtures.md](docs/reference/fixtures.md); [docs/reference/api.md](docs/reference/api.md) |
| `scripts/record-fixtures.ts` | how-to | [docs/how-to/record-fixtures.md](docs/how-to/record-fixtures.md) |
| `src/client/routes/**`, `vite.config.ts`, `.storybook/**`, `public/**`, `scripts/render-icons.ts` | explanation | [docs/explanation/architecture.md](docs/explanation/architecture.md) |
| `src/client/components/**`, `src/client/hooks/**`, `src/client/utils/**` | reference; explanation | [docs/reference/conventions.md](docs/reference/conventions.md); [docs/explanation/architecture.md](docs/explanation/architecture.md) |
| `src/test/**`, `e2e/**`, `vitest.config.ts`, `playwright.config.ts` | reference; how-to | [docs/reference/test-infrastructure.md](docs/reference/test-infrastructure.md); [docs/reference/testing.md](docs/reference/testing.md); [docs/how-to/run-the-tests.md](docs/how-to/run-the-tests.md) |
| `package.json` scripts | how-to; tutorial | [docs/how-to/run-the-tests.md](docs/how-to/run-the-tests.md); [docs/how-to/deploy.md](docs/how-to/deploy.md); [docs/tutorials/getting-started.md](docs/tutorials/getting-started.md) |
| `.oxlintrc.json`, `.oxfmtrc.json`, `scripts/oxlint/**` — lint and format rules | explanation; reference | [docs/explanation/tooling.md](docs/explanation/tooling.md); [docs/reference/conventions.md](docs/reference/conventions.md); [docs/reference/testing.md](docs/reference/testing.md) |
| `scripts/check-*.ts` — what a gate checks, or a new one | explanation; how-to | [docs/explanation/tooling.md](docs/explanation/tooling.md); [docs/how-to/deploy.md](docs/how-to/deploy.md) |
| `android/**`, `public/.well-known/**` (the TWA, its asset links) | explanation; how-to | [docs/explanation/architecture.md](docs/explanation/architecture.md); [docs/how-to/deploy.md](docs/how-to/deploy.md) |
| `wrangler.toml`, `.github/workflows/**` | how-to; reference | [docs/how-to/deploy.md](docs/how-to/deploy.md); [docs/reference/api.md](docs/reference/api.md) |
| `.claude/skills/**`, `.claude/hooks/**` — a convention restated for agents | — | keep in step with the `docs/` page it points at; a rule that moves in one has to move in both |
| README's Status / Documentation sections | — | keep in step with `docs/` (don't let them contradict) |

A new architectural decision — or reversing an existing one — gets an ADR under
[docs/adr/](docs/adr/). To reverse a decision, carry the old ADR's still-valid reasons into the new
one, delete the old ADR and renumber the later ones with no gaps, then grep the repo for stale
links. Git history keeps the old record.

When unsure whether a code change needs a doc edit, check the mapped doc and either update it or
confirm it still reads true — a two-minute check beats silent drift.
