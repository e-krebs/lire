# Architecture

Lire is a single-user reader over NewsBlur: a static PWA on Cloudflare Pages, and a small Worker
that holds the credentials and serves a Lire-owned API, translated to NewsBlur calls (a
backend-for-frontend, [ADR 0009](../adr/0009-newsblur-bff.md)).

## Diagram

```text
Browser (lire.krebs.tech)
  │
  │  Cloudflare Access: login, policy, JWT on every request
  ▼
┌──────────────────────────────┐      ┌─────────────────────────────────────┐
│ Pages: static SPA            │      │ Worker lire-api (lire.krebs.tech/   │
│ React · TanStack Router ·    │ /api │ api/*)                              │
│ TanStack Query · Tailwind    ├─────►│ verifyAccess → matchRoute → handle  │
│ PWA service worker           │      │   contract: shared/feedsApi         │
└──────────────────────────────┘      │   translation: shared/bff           │
                                      │   NewsblurAuth Durable Object       │
                                      │   (session cookie, feed-list cache)│
                                      └──────────────────┬──────────────────┘
                                                         │ NEWSBLUR_HOST
                                                         │ session cookie
                                                         ▼
                                                     newsblur.com

Mock mode / demo build: the SPA swaps the HTTP transport for the same shared/bff core running
over a fake NewsBlur fed by fixtures, and never calls /api.
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

The reader sanitizes every article body with DOMPurify. A blog post renders inline under
`.prose-reader`. A newsletter, recognized by the `webfeeds--newsletter` wrapper in its HTML, renders
in a sandboxed `srcdoc` iframe on a full-width white band, so the sender's own layout and colors
apply and the app's article styles cannot break it. The parent sizes the frame to its content and forwards key
presses out of it. The reasons and limits are in
[ADR 0007](../adr/0007-newsletter-iframe.md).

A blog post keeps two kinds of frame: a YouTube `/embed/` frame, and an X frame that Lire builds
from a `twitter-tweet` blockquote. The helpers are in
[embeds.ts](../../src/client/utils/embeds.ts). Every other frame is dropped, no third-party script
runs in the app's origin, and a newsletter never gets frames. The allowlist and the privacy cost
are in [ADR 0011](../adr/0011-reader-embeds.md).

The unread filter and the sort order are per device, not per account, and never in the URL. They
live in `localStorage` under `lire.view` ([viewPrefs.ts](../../src/client/utils/viewPrefs.ts)),
behind a small store that the stream route, the view toggles and the Navigator all read.

The UI speaks English and French, through a small in-house module in
[src/client/i18n/](../../src/client/i18n/) instead of a library
([ADR 0008](../adr/0008-in-house-i18n.md)). The catalog is one file per UI area under
`messages/`, each holding `en` and `fr` side by side, and `en` is the source of truth that `fr` must
match key for key. A component reads it through `useT()`, which returns a plain nested object
(`t.subscriptions.deleteTitle`). The locale lives in a store of the same shape as the view
preferences, built on `useSyncExternalStore`, so no React provider wraps the app. The store holds a
preference, `system`, `en` or `fr`, in `localStorage` under `lire.locale`, which the account menu's
language select writes. `system` follows `navigator.languages` and listens to `languagechange`, and
any other language resolves to English. The store also keeps `<html lang>` equal to the active locale.
Every `Intl` formatter, such as the relative times in `time.ts` and the feed list in the feed panel,
takes that locale. Feed titles, category labels, article content and server error text are data and
stay as they arrive. The PWA manifest, `index.html` and the Android strings stay English.

An installed PWA opens an external link in an in-app view: a Safari view on iOS, a Custom Tab on
Android Chrome. One click listener on the document, and one on each newsletter frame's document,
sends the link to a browser the user picks in the account menu instead ([externalLinks.ts](../../src/client/utils/externalLinks.ts)). The choice is
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

Sign-in in the TWA stays on one origin. The link to `/api/auth/login` is same-origin, and the
Worker logs in to NewsBlur server side before it redirects home. The flow is in [auth.md](auth.md).

That module sits on a transport seam ([transport.ts](../../src/client/api/transport.ts)). The
HTTP transport ([adapters/http.ts](../../src/client/api/adapters/http.ts)) is a same-origin
`fetch` to `/api` with the session cookie; the fixture transport
([adapters/fixture.ts](../../src/client/api/adapters/fixture.ts)) runs the Worker's translation core
over a fake NewsBlur ([adapters/fakeNewsblur.ts](../../src/client/api/adapters/fakeNewsblur.ts)),
which replays JSON files. The
client maps a `401` to a `sign_in_required` error, and the root route
([\_\_root.tsx](../../src/client/routes/__root.tsx)) watches the whole query cache for it, so a
sign-in failure on any query swaps the shell to the sign-in screen.

### Worker

The Worker `lire-api` ([wrangler.toml](../../wrangler.toml),
[src/server/worker.ts](../../src/server/worker.ts)) is bound to the route
`lire.krebs.tech/api/*`, so it shares the SPA's origin and needs no CORS. It answers only paths
under `/api/`: the two sign-in routes, and the routes of the Lire contract. How it authenticates
is the subject of [auth.md](auth.md).

The contract is the list in [src/shared/feedsApi/routes.ts](../../src/shared/feedsApi/routes.ts):
`matchRoute` maps a method and path to a route and its params, and anything else gets a `404` before
any session is read. The Worker never forwards a client path. It passes the matched route to
`handle` ([src/shared/bff/handle.ts](../../src/shared/bff/handle.ts)), which makes the NewsBlur
calls the route needs and answers in Lire's shapes. The client never sees a NewsBlur id or answer
shape: a feed id is the numeric NewsBlur id, a category is a top-level folder named by its title,
and an entry is a `story_hash`. The reasons and the rules the core enforces (counts, paging, the
user check, the `code < 1` failure) are in [ADR 0009](../adr/0009-newsblur-bff.md).

The core lives in `shared/` because it is pure and takes its `fetch` as an argument. The Worker
passes a `fetch` that adds the session cookie and calls `NEWSBLUR_HOST`; mock mode passes the fake
NewsBlur. A new route is a contract entry plus a handler. The contract bounds what a compromised
or buggy client can do with the owner's session: it cannot reach any other NewsBlur endpoint. The
Worker answers with its own JSON, never with upstream headers.

The Durable Object also caches the folder tree (`/reader/feeds`) for five minutes, since most
reads need it, and drops it on every subscription or folder write.

## Mock mode is the default

[client.ts](../../src/client/api/client.ts#L43) treats every value of `VITE_API_MODE` other than
`real` as mock mode. `yarn dev`, the unit tests, Storybook and the device e2e projects therefore run on fixtures with
no Worker, no Access and no account, and only the production deploy sets `real` explicitly. The
default errs toward the mode that cannot leak personal data or spend upstream quota.

In mock mode the fixture transport matches the same routes and runs the same `handle` as the
Worker, over `createFakeNewsblur`: an in-memory NewsBlur that answers every upstream call the core
makes, and keeps read state and folder changes. A fixture therefore exercises the real translation,
not a parallel one.

The same file compares the literal env value rather than calling `isMockMode()`, so that the
bundler drops the fixture chunk from a real build. A secret gate in CI checks that the real
`dist/` carries no seed fixtures (see [tooling.md](tooling.md)). Which fixture set loads, seed or
recorded, is in [../reference/fixtures.md](../reference/fixtures.md).

## The demo build

`yarn build:demo` is a mock build over the seed fixtures with `VITE_DEMO=true`. The root route
then renders `DemoBanner` and never shows the sign-in screen
([\_\_root.tsx](../../src/client/routes/__root.tsx#L32-L34)). The result is a public showcase on
`demo.lire.krebs.tech`, outside Access. Since it is public, it carries no recorded profile value;
the demo gate enforces it on a machine that holds the recording.

The showcase is not read-only. The fixture transport applies writes (mark as read, subscription
and category edits, preferences) to in-memory state, and nothing in the demo build blocks them.
A reload restores the seed, including pending read marks, which a mock build keeps in memory only. The preferences bucket persists in `localStorage`; the
banner's Reset button clears both ([DemoBanner.tsx](../../src/client/components/shell/DemoBanner.tsx)).
Nothing a visitor does reaches an account.

| | Demo | Production |
| --- | --- | --- |
| Build command and env | [`build:demo`](../../package.json): `VITE_API_MODE=mock`, `VITE_DEMO=true`, `VITE_FIXTURES=seed` | [`deploy:spa`](../../package.json): `VITE_API_MODE=real` only |
| Data source | Seed fixtures ([fixture.ts](../../src/client/api/adapters/fixture.ts)) | The owner's live account, through the Worker |
| Network | No `/api` calls ([client.ts](../../src/client/api/client.ts#L43)) | Same-origin `/api`, served by the Worker |
| Auth | None ([\_\_root.tsx](../../src/client/routes/__root.tsx#L34)) | Cloudflare Access with the owner pin ([auth.md](auth.md)) |
| Host and visibility | `demo.lire.krebs.tech`, public | `lire.krebs.tech`, private |
| Pages project | `lire-demo` | `lire` |
| Build gates | Recorded profile and secrets ([check-demo-brand.ts](../../scripts/check-demo-brand.ts)) | Secrets |

The host, visibility and Pages project rows are in [deploy.md](../how-to/deploy.md#pages-projects-and-domains).

## Storybook

Storybook ([.storybook/](../../.storybook/)) is its own surface, built and deployed apart from the
app by its own CI jobs ([ci.yml](../../.github/workflows/ci.yml)). Its Vite config drops the app's
route generator, PWA plugin and second React plugin
([main.ts](../../.storybook/main.ts)), because those only make sense for the real app. Stories
double as tests: the `storybook` Vitest project runs them in a browser with the a11y addon. A
`locale` toolbar global switches every story between English and French.

The built Storybook is deployed public at `storybook.lire.krebs.tech`, outside Access. What keeps it
safe is the demo gate, `yarn check:demo storybook-static`
([check-demo-brand.ts](../../scripts/check-demo-brand.ts)). On a machine that holds a recording, it fails on the
recorded profile id or email. It runs in the `storybook`
CI job and in `deploy:storybook` before the upload. The story data comes from the committed seed
fixtures, which the gate checks rather than assumes.

## PWA

[vite.config.ts](../../vite.config.ts) builds the service worker through `vite-plugin-pwa` in
`injectManifest` mode from [sw.ts](../../src/client/sw.ts). The worker precaches the built assets
and falls back to `index.html` for navigation. The fallback denylists `/api/`, because the Worker
serves `/api/auth/login` as an HTML page: if the service worker answered that navigation with the
SPA shell, the login would never run. In dev the manifest is nearly empty, so the fallback route is
skipped there.

The worker also holds a `sync` handler. Read marks wait in an IndexedDB store
([markReadStore.ts](../../src/client/api/markReadStore.ts)) that the page and the worker share. The
page queue registers the `mark-read` sync tag when it may not deliver: on hide, in parallel with the
keepalive flush, and after a retryable failure while the page is hidden. A visible page retries
through the `online` replay and at start. The worker then sends the stored ids
([markReadSync.ts](../../src/client/api/markReadSync.ts)). Background Sync exists only in Chromium
and the Android app. Elsewhere the page flushes on hide and replays stored ids at the next start
and when the browser goes online. The real build runs all of this; the mock build keeps the ids in
memory and registers no sync. [0012](../adr/0012-persisted-mark-read-queue.md) records why.

The first list fetch of a session waits for the start replay (`whenReplayed` in
[markReadQueue.ts](../../src/client/api/markReadQueue.ts)), so marks an earlier session left stored
reach NewsBlur before the page reads. The wait is capped at 3 seconds, so a slow or stuck replay
delays the first read but never blocks it. `flush()` also waits for batches already on the wire, so
a refetch never overtakes a mark.

A device that sat in the background holds stale lists, and nothing refetches on focus: the stale
time is ten minutes. [useRefreshOnForeground](../../src/client/hooks/useRefreshOnForeground.ts)
fires when the page returns after more than 60 seconds hidden, and skips a refresh while another
is still running. `useRefreshAllLists` in
[queries.ts](../../src/client/api/queries.ts) then flushes the queue and invalidates every stream,
search and entry cache plus the counts. It keeps loaded pages, unlike pull-to-refresh, which trims
to page 1. A global `refetchOnWindowFocus` would refetch every list at once.

Updates are prompt-style. A new worker installs and waits. The page learns of it through
[pwaUpdate.ts](../../src/client/utils/pwaUpdate.ts) and shows `UpdateToast`
([UpdateToast.tsx](../../src/client/components/shell/UpdateToast.tsx)) with Reload and Later.
Reload flushes the read-mark queue, then tells the worker to skip waiting, and the page reloads once
the new worker controls it. The same toast announces once that the app opens offline. The page asks
for a new worker every hour and whenever the tab becomes visible, because an installed app rarely
reloads on its own.

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
signed out, or when any query fails with `sign_in_required`. The cache-wide check means a session
the upstream revokes mid-session still lands the reader on the sign-in screen, whichever query
noticed first. Queries never retry a `401` or a `429`
([queryClient.ts](../../src/client/api/queryClient.ts#L8-L11)).

### Empty-state art

An empty article list shows one of the "doing nothing" scenes above its text, picked at random when
the empty state mounts ([MosaicEmptyArt.tsx](../../src/client/components/articles/MosaicGrid/MosaicEmptyArt.tsx)).
Each scene has a day and a dusk WebP (`-light` and `-dark`) in [src/client/assets/empty](../../src/client/assets/empty).
The phase comes from the sun: the client asks `GET /api/sun` for its time zone
([api.md](../reference/api.md)) and refetches when `nextChangeAt` passes, so the image swaps live
at sunrise and sunset. While that loads, fails offline or answers 404 (a zone with no coordinates),
the phase follows `prefers-color-scheme` through `useColorScheme`, so nothing flashes. The image is
a labelled button: a tap cross-fades to the other phase until the sun phase next changes. The image
itself is decorative (`alt=""`), because the text below it already says the list is empty. The service worker precaches the WebP files with the other built
assets, so the art also shows offline. To add a scene, follow
[add-an-empty-state-scene.md](../how-to/add-an-empty-state-scene.md).
