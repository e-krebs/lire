# Deploy

Lire ships three static sites to Cloudflare Pages and one Worker. All four deploy from CI on every
push to `main` that touches what each one ships or depends on. A manual run deploys all four.

## What deploys how

| Target | Script | Trigger | Pages project / Worker |
| --- | --- | --- | --- |
| SPA | `yarn deploy:spa` | CI, push to `main` with `app` changes, or a manual run | `lire` |
| Demo | `yarn deploy:demo` | CI, push to `main` with `app` changes, or a manual run | `lire-demo` |
| Storybook | `yarn deploy:storybook` | CI, push to `main` with `storybook` changes, or a manual run | `lire-storybook` |
| Worker | `yarn worker:deploy` | CI, push to `main` with `worker` changes, or a manual run | `lire-api` |
| Android app | `./gradlew assembleRelease` in `android/` | CI, push to `main` that touches `android/`, or a manual run | A GitHub Release |

## Change-based deploys

The `changes` job in [ci.yml](../../.github/workflows/ci.yml) lists the files a push touched and
sets one output per area. Each check and deploy job runs only when its area changed.

| Area | Deploys and checks it turns on | Changed files that set it |
| --- | --- | --- |
| `app` | `verify`, `e2e`, SPA and demo deploys, `preflight` | `src/client/**`, `src/shared/**`, `public/**`, `index.html`, `vite.config.ts`, `fixtures/**`, the dist and demo-brand check scripts |
| `storybook` | `verify`, `storybook`, Storybook deploy, `preflight` | `.storybook/**`, `src/client/**`, `src/shared/**`, `src/test/**`, `public/**`, `fixtures/**`, `vite.config.ts`, `vitest.config.ts`, the demo-brand check script |
| `worker` | `verify`, `e2e`, Worker deploy, `preflight` | `src/server/**`, `src/shared/**`, `wrangler.toml` |
| `tooling` | `verify`, `e2e` | `src/test/**`, `e2e/**`, `scripts/**`, Playwright, Vitest, knip, lint and format config |
| `infra` | `preflight`, `check-live` | the provisioning, Access, Cloudflare API, live-check and deploy-targets scripts |

A change to `package.json`, `yarn.lock`, `.yarnrc.yml`, `.yarn/`, `.nvmrc`, a tsconfig file, the
[setup action](../../.github/actions/setup/action.yml) or ci.yml itself sets every area. So does a
changed file that no area list and no ignore list names (docs, Markdown, `android/`, `.claude/`
and a few dotfiles are ignored). A manual run sets every area. `preflight` runs when any deploy
runs, and `check-live` runs when any deploy ran.

## Force a full deploy

Run the CI workflow by hand to deploy everything: open the Actions tab, pick CI, choose Run
workflow and select `main`. The run skips the change filter, so every check and deploy runs. Use it
when a deploy failed and later commits skipped it, or after a rotated secret. `cloudflare-gate`
accepts a manual run only from `main`.

## CI gates

The `cloudflare-gate` job checks that `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist and
skips every Cloudflare job cleanly when they do not. The `preflight` job then runs
`yarn check:access` and `yarn provision:pages`, and every deploy job needs it. `preflight` also
fails while `NEWSBLUR_CLIENT_ID` is empty in `wrangler.toml`. The SPA, demo and
Worker jobs need both `verify` and `e2e` green; the Storybook job needs the `storybook` job. A job
skipped by the change filter does not block a deploy, but a failed one does. The `check-live` job
runs last, once the deploys that ran finish, and runs `yarn check:live`. The `docs-links` job runs
the docs link gate on every run, because docs link to code paths and a rename breaks them. `verify`
runs lockfile dedupe, lint, knip, format, every typecheck, both coverage runs, the export-coverage
check, and the three build-and-secret gates. It skips when only docs, Android or other ignored
files changed. `e2e` also skips then, and runs on `app`, `worker` and `tooling` changes. See
[Run the tests](run-the-tests.md).

`yarn check:access`, `yarn provision:pages` and `yarn check:live` also run locally with the same
env vars set. `yarn deploy:spa` builds with `VITE_API_MODE=real` and runs `yarn check:secrets` before it
uploads.

## Secrets and variables

| Name | Where | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | GitHub repo secret | Cloudflare API token for every CI job |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub repo secret | Cloudflare account for CI |
| `ACCESS_ALLOWED_EMAIL` | GitHub repo secret, Worker secret | Owner email pin |
| `ACCESS_TEAM_DOMAIN` | `[vars]` in [wrangler.toml](../../wrangler.toml) | Access team domain |
| `ACCESS_AUD` | `[vars]` in wrangler.toml | Access application audience |
| `NEWSBLUR_HOST`, `NEWSBLUR_CLIENT_ID` | `[vars]` in wrangler.toml | NewsBlur base URL and OAuth client id |
| `NEWSBLUR_CLIENT_SECRET` | GitHub repo secret, Worker secret | OAuth client secret |
| `NEWSBLUR_NEWSLETTER_ADDRESS` | GitHub repo secret, Worker secret | The newsletter address the app shows |
| `LIRE_KEYSTORE_BASE64` | GitHub repo secret | Android signing keystore, base64 |
| `LIRE_KEYSTORE_PASSWORD` | GitHub repo secret | Password of that keystore and its `lire` key |

The API token carries these scopes:

- Account: Cloudflare Pages Edit, Workers Scripts Edit, Access: Apps and Policies Read, Access:
  Organizations, Identity Providers, and Groups Read.
- Zone `krebs.tech` only: Workers Routes Edit, DNS Edit, Zone Read.

CI passes `ACCESS_ALLOWED_EMAIL`, `NEWSBLUR_CLIENT_SECRET` and `NEWSBLUR_NEWSLETTER_ADDRESS` to the
Worker with `wrangler deploy --secrets-file`, which never deletes existing secrets. The
`deploy-worker` job fails when `NEWSBLUR_CLIENT_SECRET` is empty. The newsletter address holds
NewsBlur's secret token, so anyone who has it can post into the feed list: keep it out of logs and
commits. `[vars]` come from wrangler.toml on every deploy. A CI deploy fails
without the pin; a Worker deployed without it trusts the Access policy alone. Never commit a
secret value.

## NewsBlur OAuth app

Sign-in needs an OAuth client from NewsBlur, and three values in the repo before the Worker deploys.
Until they exist, `preflight` fails on the empty client id and the Worker job fails on the empty
secret.

1. Ask NewsBlur (samuel@newsblur.com) for an OAuth client. Give it the redirect URI
   `https://lire.krebs.tech/api/auth/callback` and the scopes `read` and `write`.
2. Set the client id as `NEWSBLUR_CLIENT_ID` in `[vars]` of [wrangler.toml](../../wrangler.toml).
   It ships empty.
3. Add the GitHub repo secret `NEWSBLUR_CLIENT_SECRET` with the client secret.
4. Add the GitHub repo secret `NEWSBLUR_NEWSLETTER_ADDRESS`. Copy the address
   (`<username>-<token>@newsletters.newsblur.com`) from the NewsBlur settings.

The recorder needs none of these. It logs in with a username and a password in `.env.local` (see
[Record the fixtures](record-fixtures.md)).

## Cloudflare Access

The Access application is managed in the dashboard and checked by `yarn check:access` in CI. It
covers `lire.krebs.tech`, `lire-6s2.pages.dev` and
`*.lire-6s2.pages.dev`. Its policy admits the owner email only, with an `allow` decision. The check fails when a policy
differs from `ACCESS_ALLOWED_EMAIL`, or when the team domain or AUD differ from `ACCESS_TEAM_DOMAIN`
and `ACCESS_AUD` in wrangler.toml. See [Auth](../explanation/auth.md).

A second Access application, "Lire public icons", holds a Bypass policy for Everyone on four paths
of `lire.krebs.tech`: `/apple-touch-icon.png`, `/icon-*.png`, `/manifest.webmanifest` and
`/.well-known/assetlinks.json`. Without it, iPad Chrome fetches the home-screen icon without the
session cookie and gets the Access login redirect, so the icon is blank. Android cannot verify the
app's asset links either, so the Android app shows an address bar. Access picks the most specific path, so the rest of the host stays
closed. `yarn check:access` finds the main application by its AUD and ignores this one. To check the
bypass, run `curl -sI https://lire.krebs.tech/apple-touch-icon.png`. It must return `200` with an
image type.

## Android app

[.github/workflows/android.yml](../../.github/workflows/android.yml) builds the Trusted Web Activity
in [android/](../../android/) on every push to `main` that touches `android/`. Editing the workflow
file alone releases nothing; a pull request that edits it still builds the debug APK. It signs the APK with the
keystore secrets and attaches it to a new GitHub Release named `android-1.<run number>`. A pull
request only builds the debug APK, without the secrets. To ship a release without an Android
change, run the workflow by hand from the Actions tab.

To install or update the app, open the latest `android-*` release on the phone, download the APK
and open it. Android asks once to allow installs from the browser.

The keystore and its password live in the owner's password manager. The CI secrets are copies of
them. Lose the keystore and the next APK cannot update the installed app: uninstall it first, then
change the fingerprint in [assetlinks.json](../../public/.well-known/assetlinks.json). To print the
fingerprint of a keystore, run:

```sh
keytool -list -v -keystore lire.keystore -alias lire | grep SHA256
```

To build a signed APK locally, set `LIRE_KEYSTORE_FILE` and `LIRE_KEYSTORE_PASSWORD`, then run
`./gradlew assembleRelease` in `android/` with JDK 17 and the Android SDK.

## Pages projects and domains

`yarn provision:pages` creates any missing Pages project, custom domain and DNS record. It never
deletes or overwrites, and it fails when the `lire` project's pages.dev subdomain is not
`lire-6s2.pages.dev` or a DNS record points elsewhere or is not proxied.

- `lire` serves `lire.krebs.tech`, behind Access.
- `lire-demo` serves `demo.lire.krebs.tech`, public.
- `lire-storybook` serves `storybook.lire.krebs.tech`, public.

The Worker `lire-api` is bound to `lire.krebs.tech/api/*` on the `krebs.tech` zone. Its Durable
Object `NewsblurAuth` comes from the `v2` SQLite migration, which also deletes the previous
auth class and the token it stored. The first deploy after the move applies it.

## Deploy the Worker

CI deploys the Worker through the `deploy-worker` job. To deploy from a machine instead, set
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, write `ACCESS_ALLOWED_EMAIL=<owner email>`,
`NEWSBLUR_CLIENT_SECRET=<secret>` and `NEWSBLUR_NEWSLETTER_ADDRESS=<address>` to a file and run:

```sh
yarn worker:deploy --secrets-file <file>
```

Check the host is closed and the sites answer. The whole host sits behind Access, so an
unauthenticated request stops at the edge with a redirect to the Access login, not a Worker `403`:

```sh
yarn check:live
```

The Worker's fail-closed `403` is covered by the Worker tests.

## Demo

The demo is the SPA in mock mode on the seed fixtures, with the real brand removed.

```sh
yarn build:demo
yarn check:demo
```

`yarn deploy:demo` runs both, then `yarn check:secrets`, then uploads. Check the result:

```sh
curl -sI https://demo.lire.krebs.tech
```

It returns `200` with no Access redirect.

## Storybook

Run it locally on port 6006:

```sh
yarn storybook
```

`yarn deploy:storybook` runs `yarn build:storybook`, then the brand gate on the output
(`yarn check:demo storybook-static`), then uploads `storybook-static`. The gate keeps the public
Storybook free of recorded data and the upstream brand; the CI `storybook` job runs it too. Check
the result:

```sh
curl -sI https://storybook.lire.krebs.tech
```

It returns `200` with no Access redirect.

## Re-auth

When NewsBlur revokes the token, the SPA shows the sign-in screen and `/api/auth/status` returns
`false`. No redeploy is needed.

1. Open `https://lire.krebs.tech/api/auth/login` and pass Access.
2. Approve the app on NewsBlur. The callback stores the new token and redirects to `/`.
3. Confirm `https://lire.krebs.tech/api/auth/status` returns `{"signedIn":true}`.

## Local Worker limits

`yarn worker:dev` serves the Worker on `localhost:8787`, but every `/api` request returns `403`
until a valid Access JWT arrives, and the SPA in real mode needs `/api` on its own origin. Check
the Worker live after deploying it. A gitignored `.dev.vars` file can hold `ACCESS_ALLOWED_EMAIL`
for local runs.
