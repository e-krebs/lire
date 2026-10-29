# 0013. Keep the onboarding checklist state in the user's Durable Object

## Status

Accepted.

## Context

A new account sees a checklist card at the top of the list pane. Its progress, and whether the card
is collapsed or dismissed, must follow the reader to every device, so a second browser resumes where
the first stopped. Until now the `NewsblurAuth` Durable Object held only the NewsBlur grant, the
hashes of the browser tokens and the folder-tree cache. Nothing in it was product state.

The NewsBlur account already stores some of the reader's settings, the `lire.*` preferences, through
`set_preference`. Those hold one string per key, and `set_preference` cannot delete a key
([ADR 0009](0009-newsblur-bff.md)). The checklist needs a map of ticked steps and two flags, written
from several devices at once.

## Decision

The checklist state lives in the `NewsblurAuth` Durable Object of the signed-in user, under the
`onboarding` key. It holds `{ done, collapsed, dismissed }`, where `done` lists the ticked step ids.
`GET /api/onboarding` reads it, and `PATCH /api/onboarding` merges a partial update inside one
synchronous storage transaction, entry by entry. A `done` value of `false` unticks a step, so two
devices that tick different steps do not overwrite each other.

- The install step is never stored, because install state belongs to a device. Its row appears once
  the browser offers the prompt, stays after the prompt is clicked, and is ticked on its own once the
  app is installed. Its Install button shows only while the prompt can still show; after that the row
  keeps a browser-menu hint. The card does not toggle it.
- Every other step, `addFeed` included, is a manual tick stored in `done`. The feed list does not
  decide it, so a reader who adds a feed and then unticks the row keeps it unticked.
- Sign-out and a rejected grant keep the state. Clearing the grant drops only the grant and the
  folder-tree cache.
- Fixture and demo mode keep the same state in `localStorage` under `lire.fixture.onboarding`, and
  the demo reset removes it.

Guard: the state is safe only while the object survives. Never call `deleteAll` on a `user-id:`
object, because that erases the grant and the onboarding state together. `deleteAll` runs only on
the throwaway `oauth:<state>` objects of the sign-in flow ([ADR 0012](0012-newsblur-oauth.md)).

## Consequences

- The Durable Object now holds product state as well as the grant and the cache. The sections of
  [auth](../explanation/auth.md) and [architecture](../explanation/architecture.md) that describe its
  contents cover it.
- Progress is per NewsBlur account, not per browser, and it is not in NewsBlur itself. Lire owns its
  storage, and a reset of the Durable Object erases it.
- The PATCH merge makes a concurrent tick from another device safe without a version field.
- A step added later has no key in a state saved before it, so it reads as not done and the account is
  not completed until the reader ticks it. Nothing migrates the stored state.
