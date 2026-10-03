# Documentation

These docs follow the [Diátaxis](https://diataxis.fr) framework: two axes, action vs. cognition and
acquisition vs. application of skill, cross to form four types (tutorials, how-to guides, reference,
explanation), each answering a different kind of question. Agent-facing writing conventions for
these docs live in the `diataxis-docs` skill (`.claude/skills/diataxis-docs/SKILL.md`).

## Tutorials: learning

- [tutorials/getting-started.md](tutorials/getting-started.md) - install, run `yarn dev` in mock mode
  and see the reader on the seed fixtures.

## How-to guides: tasks

- [how-to/deploy.md](how-to/deploy.md) - deploy the Worker and the Pages site, and the demo, with the
  secrets and re-auth they need, and release and install the Android app.
- [how-to/record-fixtures.md](how-to/record-fixtures.md) - record your own feeds into `fixtures/real/`.
- [how-to/run-the-tests.md](how-to/run-the-tests.md) - commands and setup for every test tier.

## Reference: information

- [reference/api.md](reference/api.md) - the Worker routes and the environment variables.
- [reference/conventions.md](reference/conventions.md) - code layout and conventions.
- [reference/fixtures.md](reference/fixtures.md) - seed vs recorded fixtures and the selection rule.
- [reference/glossary.md](reference/glossary.md) - terms used across code and docs.
- [reference/test-infrastructure.md](reference/test-infrastructure.md) - the test machinery: projects,
  MSW, the Playwright tiers.
- [reference/testing.md](reference/testing.md) - the style test files follow.

## Explanation: understanding

- [explanation/architecture.md](explanation/architecture.md) - the SPA, the Worker and how they fit.
- [explanation/auth.md](explanation/auth.md) - Cloudflare Access, the owner pin and the NewsBlur session
  cookie.
- [explanation/tooling.md](explanation/tooling.md) - why the toolchain and the gates are set up as
  they are.

## ADRs: decision records

Architecture decision records sit outside the four quadrants as their own genre (see
[adr/0001-adopt-diataxis.md](adr/0001-adopt-diataxis.md)).

- [adr/0001-adopt-diataxis.md](adr/0001-adopt-diataxis.md) - Adopt Diátaxis for documentation structure
- [adr/0002-access-owner-pin.md](adr/0002-access-owner-pin.md) - Cloudflare Access plus an owner email
  pin as the outer layer
- [adr/0003-fixture-mock-mode.md](adr/0003-fixture-mock-mode.md) - Fixture-backed mock mode by default
- [adr/0004-no-module-mocks.md](adr/0004-no-module-mocks.md) - No module mocks or spies, MSW and
  `page.route` only
- [adr/0005-gated-builds.md](adr/0005-gated-builds.md) - Real and demo builds pass secret and brand
  gates before deploy
- [adr/0006-ci-owns-cloudflare-setup.md](adr/0006-ci-owns-cloudflare-setup.md) - CI deploys the Worker
  and owns the Cloudflare setup
- [adr/0007-newsletter-iframe.md](adr/0007-newsletter-iframe.md) - Render newsletters in a
  sandboxed iframe, posts stay inline
- [adr/0008-in-house-i18n.md](adr/0008-in-house-i18n.md) - Translate the UI with an in-house typed
  catalog and `Intl`, no library
- [adr/0009-newsblur-bff.md](adr/0009-newsblur-bff.md) - Serve a Lire-owned contract from the Worker
  over NewsBlur
- [adr/0010-newsblur-session-cookie.md](adr/0010-newsblur-session-cookie.md) - Sign in with the NewsBlur session cookie
