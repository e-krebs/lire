# 0009. Serve a Lire-owned contract from the Worker over NewsBlur

## Status

Accepted.

## Context

Feedly blocks Lire's API access. NewsBlur replaces it: an official API, an OAuth flow, MIT-licensed
source and $99 a year for the Premium Archive plan. Its API does not look like Feedly's. Ids differ,
paging is by page number, and many failed writes answer HTTP 200. Forwarding client paths to it would
spread those quirks through the client.

The NewsBlur token must never reach the client bundle. An open proxy would let a stolen session
call any endpoint on the account.

## Decision

The Worker is a backend-for-frontend. It serves a Lire-owned contract and translates each call to
NewsBlur.

- **Shared core.** The translation lives in `src/shared/bff/`, pure and with an injected `fetch`.
  The Worker runs it over the real NewsBlur, and mock mode runs it over a fake NewsBlur fed by
  fixtures.
- **Ids.** A feed id is the numeric NewsBlur feed id as a string, a folder id is its title and an
  entry id is the `story_hash`. All three are stable and opaque to the client.
- **Streams.** `all`, `read`, `folder:<title>` and `feed:<id>`. The core expands `all` and folders
  into `feeds[]` for `/reader/river_stories`. Rivers go as form-encoded POSTs, and `count` maps to
  `limit`, because `all` with every feed id can overflow a GET URL.
- **Paging.** The token is base64url JSON `{page}`, plus the query for search, because NewsBlur
  pages by number.
- **Unread counts.** The count is `ps + nt + ng`, and rivers send `include_hidden=true`, so a list
  matches its count. Do not "fix" this to `ps + nt`. Counts cover only feeds present in the folder
  tree, because orphaned subscriptions still report counts.
- **User check.** Every read answer is checked against the user stored at sign-in. NewsBlur read
  views answer 200 with a fallback user's data on a bad token.
- **Failure rule.** A NewsBlur answer with `code < 1` or `errors` is a failure.
- **Preferences.** A deleted preference is stored as the JSON string `"null"` and dropped on read,
  because `set_preference` has no delete.
- **Feed cache.** The Durable Object caches `/reader/feeds` for 5 minutes and drops it on every
  subscription or folder write. A generation counter makes a read that started before a write
  skip its cache set.
- **Mark read.** The client batches: it flushes at 5 hashes or 10 seconds, and on `pagehide` with
  `keepalive`. The optimistic cache update stays instant.

## Consequences

- The client never sees provider ids or NewsBlur response shapes.
- The Worker answers only the routes of the contract and refuses any other path.
- The client and the Worker share the contract module in `src/shared/feedsApi/`, so the two
  cannot drift.
- A new route is a contract entry plus a handler, reviewed like any code change.
- Mock mode and the Worker run the same core, so a fixture exercises the real translation.
- The Worker adds one hop and a translation layer to maintain, and tracks NewsBlur behavior changes.
- Sign-in is covered by [0010](0010-newsblur-oauth.md).
- Detail: [architecture](../explanation/architecture.md).
