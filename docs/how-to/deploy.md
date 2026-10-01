# Deploy

Lire ships three static sites to Cloudflare Pages and one Worker. All four deploy from CI on every
push to `main`.

## What deploys how

| Target | Script | Trigger | Pages project / Worker |
| --- | --- | --- | --- |
| SPA | `yarn deploy:spa` | CI, push to `main` | `lire` |
| Demo | `yarn deploy:demo` | CI, push to `main` | `lire-demo` |
| Storybook | `yarn deploy:storybook` | CI, push to `main` | `lire-storybook` |
| Worker | `yarn worker:deploy` | CI, push to `main` | `lire-api` |
| Android app | `./gradlew assembleRelease` in `android/` | CI, push to `main` that touches `android/` | A GitHub Release |


## CI gates

The `cloudflare-gate` job checks that `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist and
skips every Cloudflare job cleanly when they do not. The `preflight` job then runs
`yarn check:access` and `yarn provision:pages`, and every deploy job needs it. The SPA, demo and
Worker jobs need both `verify` and `e2e` green; the Storybook job needs the `storybook` job. The
`check-live` job runs last, once all four deploys finish, and runs `yarn check:live`. `verify` runs the docs link gate, lockfile dedupe, lint, knip, format, every typecheck,
both coverage runs, the export-coverage check, and the three build-and-secret gates. See
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
| `FEEDLY_HOST`, `FEEDLY_CLIENT_ID` | `[vars]` in wrangler.toml | Upstream API |
| `LIRE_KEYSTORE_BASE64` | GitHub repo secret | Android signing keystore, base64 |
| `LIRE_KEYSTORE_PASSWORD` | GitHub repo secret | Password of that keystore and its `lire` key |

The API token carries these scopes:

- Account: Cloudflare Pages Edit, Workers Scripts Edit, Access: Apps and Policies Read, Access:
  Organizations, Identity Providers, and Groups Read.
- Zone `krebs.tech` only: Workers Routes Edit, DNS Edit, Zone Read.

CI passes `ACCESS_ALLOWED_EMAIL` to the Worker with `wrangler deploy --secrets-file`, which never
deletes existing secrets. `[vars]` come from wrangler.toml on every deploy. A CI deploy fails
without the pin; a Worker deployed without it trusts the Access policy alone. Never commit a
secret value.

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
in [android/](../../android/) on every push to `main` that touches it or the workflow. It signs the APK with the
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
Object and the `v1` SQLite migration are created by the first Worker deploy.

## Deploy the Worker

CI deploys the Worker through the `deploy-worker` job. To deploy from a machine instead, set
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, write `ACCESS_ALLOWED_EMAIL=<owner email>` to a
file and run:

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

When Feedly revokes the refresh token, the SPA shows the sign-in screen and
`/api/auth/status` returns `false`. No redeploy is needed.

1. In a browser signed in to `cloud.feedly.com`, copy `refreshToken` from the `feedly.session`
   entry (DevTools, Application, Local Storage).
2. Open `https://lire.krebs.tech/api/auth/login`, pass Access, paste the token.
3. Confirm `https://lire.krebs.tech/api/auth/status` returns `{"signedIn":true}`.

## Local Worker limits

`yarn worker:dev` serves the Worker on `localhost:8787`, but every `/api` request returns `403`
until a valid Access JWT arrives, and the SPA in real mode needs `/api` on its own origin. Check
the Worker live after deploying it. A gitignored `.dev.vars` file can hold `ACCESS_ALLOWED_EMAIL`
for local runs.
