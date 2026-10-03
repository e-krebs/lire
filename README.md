# Lire

Lire is a personal feed reader PWA — a phone/tablet/desktop reader, served as a static SPA and
backed by a Cloudflare Worker that serves a Lire API over NewsBlur, behind Cloudflare Access.

## Status

The app runs in mock mode by default, against recorded or synthetic NewsBlur fixtures: categories,
unread counts, streams with paging, an article reader, mark read and mark-all-read, subscription
add, move and unsubscribe. Three layout tiers (phone, tablet, desktop) and a PWA shell. The UI is in
English and French, following the browser unless the account menu picks one. The Worker exists:
Cloudflare Access with an owner email pin guards it, the NewsBlur OAuth code flow signs the owner in,
and the token, kept in a Durable Object, authenticates the upstream calls.

Setting up a deployment needs a NewsBlur OAuth client and three values in the repo; see
[docs/how-to/deploy.md](docs/how-to/deploy.md#newsblur-oauth-app). Recording your own fixtures needs
`NEWSBLUR_USERNAME` and `NEWSBLUR_PASSWORD` in `.env.local`.

## Quickstart

```sh
yarn                 # install (Yarn 4)
yarn dev             # SPA in mock mode, http://localhost:3000
yarn storybook       # component stories, http://localhost:6006
yarn fixtures:record # optional: record your own feeds (needs .env.local, see .env.sample)
```

`fixtures/real/` is gitignored; without it the app uses the synthetic `fixtures/seed/`. See
[docs/tutorials/getting-started.md](docs/tutorials/getting-started.md) for a walkthrough.

## Tests

```sh
yarn test        # client unit tests
yarn test:worker # Worker tests
yarn test:e2e    # all Playwright projects
```

See [docs/how-to/run-the-tests.md](docs/how-to/run-the-tests.md) for every tier and its setup.

## Documentation

The docs follow [Diátaxis](https://diataxis.fr). [docs/README.md](docs/README.md) maps every file.

- [docs/tutorials/](docs/tutorials/) - learning by doing
- [docs/how-to/](docs/how-to/) - task recipes
- [docs/reference/](docs/reference/) - facts to look up
- [docs/explanation/](docs/explanation/) - why it is built this way
- [docs/adr/](docs/adr/) - decision records

## Demo

A public demo, on the committed seed fixtures with no trace of the upstream service, is served at
https://demo.lire.krebs.tech.

```sh
yarn build:demo # build the demo bundle (mock mode, seed fixtures)
yarn check:demo # fail on any upstream brand trace in the demo bundle
```

CI deploys the demo on every push to `main`, creating the `lire-demo` Cloudflare Pages project
when it is missing.
