# Glossary

Terms used across the code and the docs.

| Term | Meaning |
| --- | --- |
| Access | Cloudflare Access, the gate in front of the Worker. `verifyAccess` in [access.ts](../../src/server/access.ts) checks its JWT on every `/api/` request. |
| AUD | The Access application audience tag, `ACCESS_AUD` in [wrangler.toml](../../wrangler.toml). The JWT audience must equal it. |
| Owner pin | The `ACCESS_ALLOWED_EMAIL` secret, set by CI from a GitHub secret. Only the JWT of that email passes. |
| OAuth token | The NewsBlur access token from the code flow, kept with the user id in the `NewsblurAuth` Durable Object ([newsblurAuth.ts](../../src/server/newsblurAuth.ts)). It is valid for ten years. |
| Worker | The Cloudflare Worker in [worker.ts](../../src/server/worker.ts): the sign-in routes, auth status, and the Lire contract over NewsBlur. |
| NewsBlur | The upstream service. The Worker calls its API through the BFF core. Answer shapes are in [upstream.ts](../../src/shared/bff/upstream.ts). |
| Contract | The routes the client may call, in [routes.ts](../../src/shared/feedsApi/routes.ts). The Worker answers 404 for any other. Types are in [types.ts](../../src/shared/feedsApi/types.ts). |
| BFF core | The pure translation from a contract route to NewsBlur calls, in [src/shared/bff/](../../src/shared/bff/). The Worker and the fixture transport both run it. |
| Fake NewsBlur | `createFakeNewsblur` ([fakeNewsblur.ts](../../src/client/api/adapters/fakeNewsblur.ts)), an in-memory NewsBlur built from fixtures. It stands in for `fetch` in mock mode. |
| Transport | The function the client calls to reach the contract ([transport.ts](../../src/client/api/transport.ts)). `httpTransport` and `fixtureTransport` implement it. |
| Mock mode | `VITE_API_MODE` other than `real`. The client uses `fixtureTransport` and no network. `isMockMode` in [client.ts](../../src/client/api/client.ts) reads it. |
| Real mode | `VITE_API_MODE=real`. The client uses `httpTransport` against the Worker at `/api`. |
| Seed fixtures | Synthetic NewsBlur answers committed under `fixtures/seed/`. See [fixtures.md](fixtures.md). |
| Recorded fixtures | NewsBlur answers recorded from a live account into the gitignored `fixtures/real/`. See [fixtures.md](fixtures.md). |
| Fixture latency | The delay `fixtureTransport` adds to each response. `VITE_FIXTURE_LATENCY_MS` overrides it. |
| Demo build | A build with `VITE_DEMO=true`, mock mode and seed fixtures (`build:demo` in [package.json](../../package.json)). It shows a banner and no sign-in. |
| Stream | An ordered list of entries, addressed by a stream key. |
| Stream key | The one URL segment that names a stream: `all`, `read`, `folder:<title>` or `feed:<id>` ([streamKey.ts](../../src/shared/feedsApi/streamKey.ts)). |
| Folder | A NewsBlur folder. Top-level folders are the app's categories, and a folder's id is its title. |
| Category | A top-level folder as the client sees it, with `{id, label, feedIds}`. |
| Feed | A followed feed, with the numeric NewsBlur feed id as a string. |
| Story hash | NewsBlur's id for one story. It is the entry id in the contract. |
| Unread counts | Per feed, `ps + nt + ng` from `/reader/refresh_feeds`, summed per category and for `all`. See [ADR 0009](../adr/0009-newsblur-bff.md). |
| Cursor | The opaque paging token in a stream or search response. It is base64url JSON of the page number, and of the query for search. |
| Seed category | A seed folder named by its label in tests ([seedCategories.ts](../../src/test/seedCategories.ts)). |
