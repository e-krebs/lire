# Glossary

Terms used across the code and the docs.

| Term | Meaning |
| --- | --- |
| Access | Cloudflare Access, the gate in front of the Worker. `verifyAccess` in [access.ts](../../src/server/access.ts) checks its JWT on every `/api/` request. |
| AUD | The Access application audience tag, `ACCESS_AUD` in [wrangler.toml](../../wrangler.toml). The JWT audience must equal it. |
| Owner pin | The `ACCESS_ALLOWED_EMAIL` secret, set by CI from a GitHub secret. Only the JWT of that email passes. |
| Refresh token | The upstream refresh token pasted on the login page and kept in the `FeedlyAuth` Durable Object ([feedlyAuth.ts](../../src/server/feedlyAuth.ts)). |
| Worker | The Cloudflare Worker in [worker.ts](../../src/server/worker.ts): login page, auth status, and the proxy to the feeds API. |
| Feeds API | The upstream reader API (v3). Its types live in [types.ts](../../src/shared/feedsApi/types.ts). |
| Allowlist | The method and path pairs the app may call, in [paths.ts](../../src/shared/feedsApi/paths.ts). The Worker answers 404 for any other. |
| Transport | The function the client calls to reach the feeds API ([transport.ts](../../src/client/api/transport.ts)). `httpTransport` and `fixtureTransport` implement it. |
| Mock mode | `VITE_API_MODE` other than `real`. The client uses `fixtureTransport` and no network. `isMockMode` in [client.ts](../../src/client/api/client.ts) reads it. |
| Real mode | `VITE_API_MODE=real`. The client uses `httpTransport` against the Worker at `/api`. |
| Seed fixtures | Synthetic responses committed under `fixtures/seed/`. See [fixtures.md](fixtures.md). |
| Recorded fixtures | Responses recorded from a live account into the gitignored `fixtures/real/`. See [fixtures.md](fixtures.md). |
| Fixture latency | The delay `fixtureTransport` adds to each response. `VITE_FIXTURE_LATENCY_MS` overrides it. |
| Demo build | A build with `VITE_DEMO=true`, mock mode and seed fixtures (`build:demo` in [package.json](../../package.json)). It shows a banner and no sign-in. |
| Stream | An ordered list of entries, addressed by a stream id. Id builders are in [streams.ts](../../src/shared/feedsApi/streams.ts). |
| Stream key | The URL-safe form of a stream id ([streamKey.ts](../../src/shared/feedsApi/streamKey.ts)). |
| Collection | A user category of subscriptions. The `Collection` type is in [types.ts](../../src/shared/feedsApi/types.ts). |
| Subscription | A followed feed. |
| Marker | A read-state change, sent as a `MarkerAction`. `markAsRead` targets entries, feeds or categories. `keepUnread` targets entries. |
| Marker counts | Unread counts per stream, from `/v3/markers/counts`. |
| Continuation | The opaque cursor in a stream response that fetches the next page. |
| Seed category | A seed collection named by its label in tests ([seedCategories.ts](../../src/test/seedCategories.ts)). |
