# Architecture

Lire is a single-user reader for the feeds API: a static PWA on Cloudflare Pages, and a small
Worker that holds the credentials and forwards an allowlisted set of calls upstream.

## Diagram

```text
Browser (lire.krebs.tech)
  │
  │  Cloudflare Access: login, policy, JWT on every request
  ▼
┌──────────────────────────────┐      ┌─────────────────────────────────────┐
│ Pages: static SPA            │      │ Worker lire-api (lire.krebs.tech/   │
│ React · TanStack Router ·    │ /api │ api/*)                              │
│ TanStack Query · Tailwind    ├─────►│ verifyAccess → route → proxy        │
│ PWA service worker           │      │   path allowlist (shared/feedsApi)  │
└──────────────────────────────┘      │   FeedlyAuth Durable Object         │
                                      │   (refresh + access token)          │
                                      └──────────────────┬──────────────────┘
                                                         │ FEEDLY_HOST /v3/*
                                                         ▼
                                                     feeds API

Mock mode / demo build: the SPA swaps the HTTP transport for fixtures and never calls /api.
```

## Components

### SPA

The client is React with TanStack Router (file routes under
[src/client/routes/](../../src/client/routes/)), TanStack Query for server state, Tailwind for
styles, and Zod to parse every response against the schemas in
[src/shared/feedsApi/](../../src/shared/feedsApi/). Vite builds it; the stack and versions are in
[package.json](../../package.json). The app has no server-side rendering: Pages serves the built
`dist/`, and every data call goes through one module,
[src/client/api/client.ts](../../src/client/api/client.ts).

The unread filter and the sort order are per device, not per account, and never in the URL. They
live in `localStorage` under `lire.view` ([viewPrefs.ts](../../src/client/utils/viewPrefs.ts)),
behind a small store that the stream route, the view toggles and the Navigator all read.

An installed PWA opens an external link in an in-app view: a Safari view on iOS, a Custom Tab on
Android Chrome. One document click listener sends the link to a browser the user picks in the
account menu instead ([externalLinks.ts](../../src/client/utils/externalLinks.ts)). The choice is
per device, in `localStorage` under `lire.externalBrowser`, and "This app" turns it off. The listener
skips same-origin and non-http links, the Access login host, downloads, modified clicks, clicks a component
already handled, and any link with `data-open-in-app`. `/dev/external-links` is an unlinked page to
test each target on a device.

On iOS, the link goes through the browser's own scheme (`x-safari-https://`, `googlechromes://`).
iOS fails an unknown scheme silently. So if the app still has focus 2 s later, as when Chrome is not
installed, the link opens in the app after all.

On Android, the installed PWA has no such escape. An installed Chrome app turns every `intent://` URL
back to Chrome into a Custom Tab, with or without an explicit package, task flags or a component,
and it ignores `googlechrome://`. So Android gets a Trusted Web Activity (TWA), a small native app
in [android/](../../android/) that shows the site full screen through Chrome. The page knows it runs
there from its launch URL, `/?source=twa`, which it keeps in `sessionStorage`. The marker survives a
Cloudflare Access login, which drops the `android-app://tech.krebs.lire` referrer. A link
becomes an intent to the app's own `OpenInBrowserActivity`
([OpenInBrowserActivity.kt](../../android/app/src/main/kotlin/tech/krebs/lire/OpenInBrowserActivity.kt)),
which opens it in the named browser as a plain tab. A missing browser falls back to the default
one. Chrome hides its address bar only when
[assetlinks.json](../../public/.well-known/assetlinks.json) lists the app's signing key. How the
app ships is in [deploy.md](../how-to/deploy.md#android-app).

That module sits on a transport seam ([transport.ts](../../src/client/api/transport.ts)). The
HTTP transport ([adapters/http.ts](../../src/client/api/adapters/http.ts)) is a same-origin
`fetch` to `/api` with the session cookie; the fixture transport
([adapters/fixture.ts](../../src/client/api/adapters/fixture.ts)) answers from JSON files. The
client maps a `401` to a `sign_in_required` error, and the root route
([\_\_root.tsx](../../src/client/routes/__root.tsx)) watches the whole query cache for it, so a
sign-in failure on any query swaps the shell to the sign-in screen.

### Worker

The Worker `lire-api` ([wrangler.toml](../../wrangler.toml),
[src/server/worker.ts](../../src/server/worker.ts)) is bound to the route
`lire.krebs.tech/api/*`, so it shares the SPA's origin and needs no CORS. It answers only paths
under `/api/`: the auth status and login routes, and `/api/v3/*`, which it proxies to
`FEEDLY_HOST` after it strips the `/api` prefix. How it authenticates is the subject of
[auth.md](auth.md).

The proxy forwards a request only when its method and path match the allowlist in
[src/shared/feedsApi/paths.ts](../../src/shared/feedsApi/paths.ts#L11). Anything else gets a
`404` before any token is read. The list lives in `shared/` because it is pure string matching
with no runtime dependency: the Worker and the fixture transport both match against it, so mock
mode answers exactly the calls the real proxy lets through, and a `404` for anything else. The
allowlist bounds what a compromised or buggy client can do with the owner's token: it can read
and mark entries, and manage subscriptions, collections and preferences, but it cannot reach any
other upstream endpoint. The proxy also returns only the upstream `Content-Type` header, never the
rest.

## Mock mode is the default

[client.ts](../../src/client/api/client.ts#L43) treats every value of `VITE_API_MODE` other than
`real` as mock mode. `yarn dev`, the unit tests, Storybook and the device e2e projects therefore run on fixtures with
no Worker, no Access and no account, and only the production deploy sets `real` explicitly. The
default errs toward the mode that cannot leak personal data or spend upstream quota.

The same file compares the literal env value rather than calling `isMockMode()`, so that the
bundler drops the fixture chunk from a real build. A secret gate in CI checks that the real
`dist/` carries no seed fixtures (see [tooling.md](tooling.md)). Which fixture set loads, seed or
recorded, is in [../reference/fixtures.md](../reference/fixtures.md).

## The demo build

`yarn build:demo` is a mock build over the seed fixtures with `VITE_DEMO=true`. The root route
then renders `DemoBanner` and never shows the sign-in screen
([\_\_root.tsx](../../src/client/routes/__root.tsx#L32-L34)). The result is a public showcase on
`demo.lire.krebs.tech`, outside Access. Since it is public, it carries no upstream brand name and
no recorded profile value; the demo brand gate enforces both.

The showcase is not read-only. The fixture transport applies writes (mark as read, subscription
and collection edits, preferences) to in-memory state, and nothing in the demo build blocks them.
A reload restores the seed, except the preferences bucket, which persists in `localStorage`; the
banner's Reset button clears both ([DemoBanner.tsx](../../src/client/components/shell/DemoBanner.tsx)).
Nothing a visitor does reaches an account.

| | Demo | Production |
| --- | --- | --- |
| Build command and env | [`build:demo`](../../package.json): `VITE_API_MODE=mock`, `VITE_DEMO=true`, `VITE_FIXTURES=seed` | [`deploy:spa`](../../package.json): `VITE_API_MODE=real` only |
| Data source | Seed fixtures ([fixture.ts](../../src/client/api/adapters/fixture.ts)) | The owner's live account, through the Worker |
| Network | No `/api` calls ([client.ts](../../src/client/api/client.ts#L43)) | Same-origin `/api`, proxied by the Worker |
| Auth | None ([\_\_root.tsx](../../src/client/routes/__root.tsx#L34)) | Cloudflare Access with the owner pin ([auth.md](auth.md)) |
| Host and visibility | `demo.lire.krebs.tech`, public | `lire.krebs.tech`, private |
| Pages project | `lire-demo` | `lire` |
| Build gates | Brand and secrets ([check-demo-brand.ts](../../scripts/check-demo-brand.ts)) | Secrets |

The host, visibility and Pages project rows are in [deploy.md](../how-to/deploy.md#pages-projects-and-domains).

## Storybook

Storybook ([.storybook/](../../.storybook/)) is its own surface, built and deployed apart from the
app by its own CI jobs ([ci.yml](../../.github/workflows/ci.yml)). Its Vite config drops the app's
route generator, PWA plugin and second React plugin
([main.ts](../../.storybook/main.ts)), because those only make sense for the real app. Stories
double as tests: the `storybook` Vitest project runs them in a browser with the a11y addon.

The built Storybook is deployed public at `storybook.lire.krebs.tech`, outside Access. What keeps it
safe is the brand gate, `yarn check:demo storybook-static`
([check-demo-brand.ts](../../scripts/check-demo-brand.ts)). It fails on the upstream brand name and,
on a machine that holds a recording, on the recorded profile id or email. It runs in the `storybook`
CI job and in `deploy:storybook` before the upload. The story data comes from the committed seed
fixtures, which the gate checks rather than assumes.

## PWA

[vite.config.ts](../../vite.config.ts) registers a service worker through `vite-plugin-pwa` with
`autoUpdate`, precaches the built assets, and falls back to `index.html` for navigation. The
fallback denylists `/api/`, because the Worker serves `/api/auth/login` as an HTML page: if the
service worker answered that navigation with the SPA shell, the login form would never appear.

The build bakes the short git commit into `VITE_APP_VERSION`
([vite.config.ts](../../vite.config.ts)), and the account menu shows it as Version. After a deploy, it
tells the reader whether the installed app runs the new service worker.

## Design & UX

### Three tiers, owned by CSS

The layout has three tiers: phone, tablet and desktop. The breakpoints are
`--breakpoint-sm` (40rem) and `--breakpoint-lg` (64rem) in
[styles.css](../../src/client/styles.css), and layout adapts through Tailwind's responsive
variants. [useTier](../../src/client/hooks/useTier.ts) reads the same thresholds through
`matchMedia`, but it exists for behavior that differs per tier, not for layout. Keeping layout in
CSS means the first paint is right before any script runs, and jsdom (which has no `matchMedia`)
sees the desktop tier instead of crashing.

When a component needs a different wrapper per tier, the wrapper changes and the content is
reparented into it; [../reference/conventions.md](../reference/conventions.md#tier-variants)
holds that rule.

### One sign-in switch

Sign-in state has no route of its own. The shell shows `SignIn` when `/api/auth/status` says
signed out, or when any query fails with `sign_in_required`. The cache-wide check means a token
the upstream revokes mid-session still lands the reader on the sign-in screen, whichever query
noticed first. Queries never retry a `401` or a `429`
([queryClient.ts](../../src/client/api/queryClient.ts#L8-L11)).
