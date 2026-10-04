# 0012. Persist read marks, send them from the service worker, and prompt for updates

## Status

Accepted.

## Context

NewsBlur asks clients to batch read marks, so Lire holds them for up to 10 seconds or 5 ids. A tab
closed in that window, or a send that fails, lost the marks, and the next sync showed the entries
as unread. The PWA also updated itself silently: a new version took over on the next load without
telling the reader, and a reload could drop marks still waiting in the batch.

No earlier ADR names the service worker generator, so this decision reverses none of them.

## Decision

The decision has three parts: the queue, the worker and the update flow.

### Queue

Pending read ids persist in one IndexedDB store, `lire-mark-read`, which the page and the service
worker share. A service worker cannot read `localStorage`.

- **Age limit.** Each id carries the time it was added, and the store drops ids older than 24 hours.
  A failed send must not override an unread made on another device days later.
- **Write first.** `add` writes the id to the store before the batch can leave. Mark unread cancels
  the id and awaits its removal from the store before it calls the API, so a stored read cannot
  land after the unread.
  The mutation uses `networkMode: "always"`, so a read made offline still reaches the store
  instead of pausing. An unread made offline waits for the network before it cancels and calls
  the API, so a stored read stays until the unread can go out.
- **Flush on hide.** The queue flushes with `keepalive` on `pagehide` and when the page becomes
  hidden, because mobile browsers fire `visibilitychange` more reliably. The sync registration
  starts in parallel with that flush, not after it.
- **Replay.** At start and on the `online` event, the queue sends the ids a previous session left
  stored. `all()` reads keys and values in one transaction and also returns the unexpired ids held
  in memory. An id already pending, in flight or being written is skipped, so two replays never send
  one id twice. A replay has no caller waiting, so a failure stays silent.
- **Retryable failures.** A network error, 401, 403, 408, 429 or 5xx keeps the ids stored and
  resolves the waiters, so the optimistic read stays. Any other 4xx drops the ids and rejects the
  waiters, so the read rolls back; a bad request would otherwise loop forever. One `isRetryable`
  helper serves the page and the worker.
- **Fallback.** Mock and demo builds use a memory store, because fixture state resets on reload
  and there is no real `/api`. If IndexedDB fails in a real build, that call falls back to memory
  and never throws.

### Worker

The service worker moves from the generated `generateSW` worker to `injectManifest` with a typed
`src/client/sw.ts`, because a generated worker cannot hold a `sync` handler. It keeps the
precache and the `index.html` navigation fallback with its `/api/` denylist.

- **Background Sync.** A `sync` event sends the stored ids when the page is gone. The queue
  registers the sync tag only when the page may not deliver: on hide, and after a retryable
  failure while the page is hidden. A visible page retries through the `online` replay and at
  start. The queue never registers on `add`: an immediate sync would bypass the batching NewsBlur asks for. Only
  Chromium and the Android app support Background Sync; Firefox and Safari rely on the page flush
  and the replay.
- **Redirects.** The worker POST uses `redirect: "manual"`. An expired Access session answers a
  cross-origin redirect, which counts as retryable and keeps the ids.
- **Testability.** The handler logic sits in a pure function, `syncPending`, so jsdom tests cover
  it without a browser.
- **No automated sync test.** No end-to-end test fires the sync event and none runs on WebKit:
  `e2e/pwa.spec.ts` runs a mock build, and a real-mode worker project is heavy. The sync path is
  checked by hand.

### Update

The registration moves from `autoUpdate` to `prompt`. A toast says a new version is ready, with
Reload and Later. Reload flushes the queue first, waiting at most 2 seconds, then applies the update, so a
read mark is lost only if the flush stalls past the cap. When no worker waits or the page has no
controller, `location.reload()` runs at once; otherwise it runs 3 seconds after the request as a
fallback. The worker calls `skipWaiting` only on a `SKIP_WAITING` message and keeps
`clientsClaim`, which the plugin needs to reload the page when the worker takes control.

- **Checks.** The page asks for a new worker every hour and when the tab becomes visible, because
  installed PWAs and the Android app rarely reload on their own.
- **Offline-ready.** A dismissible notice shows once when the precache is complete.
- **Transition.** A page that still runs the earlier auto-update code never prompts, and the new
  worker waits until every tab closes.

## Consequences

- A read mark survives a closed tab, a failed send and a crash, for up to 24 hours.
- Two code paths send marks: the page queue and the worker. Both read the same store, and both
  remove an id only after a successful send.
- After a retryable failure the entry stays read in the list, while the server counts still include
  it until delivery.
- Firefox and Safari lose marks only when the page cannot flush, and recover them at the next start.
- The service worker is code to maintain and typecheck (`yarn typecheck:sw`), not generated.
- A reader on an old tab sees the update only on Reload or when every tab closes.
- Detail: [architecture](../explanation/architecture.md#pwa).
