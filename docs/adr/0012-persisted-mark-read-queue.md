# 0012. Persist read marks until they land

## Status

Accepted.

## Context

NewsBlur asks clients to batch read marks, so Lire holds them for up to 10 seconds or 5 ids. A tab
closed in that window, or a send that fails, lost the marks, and the next sync showed the entries
as unread.

## Decision

### Queue

Pending read ids persist in one IndexedDB store, `lire-mark-read`.

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
  waiters, so the read rolls back; a bad request would otherwise loop forever.
- **Fallback.** Mock and demo builds use a memory store, because fixture state resets on reload
  and there is no real `/api`. If IndexedDB fails in a real build, that call falls back to memory
  and never throws.

## Consequences

- A read mark survives a closed tab, a failed send and a crash, for up to 24 hours.
- After a retryable failure the entry stays read in the list, while the server counts still include
  it until delivery.
- Detail: [testing](../reference/testing.md).
