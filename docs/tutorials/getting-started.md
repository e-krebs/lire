# Getting started

In this lesson you clone Lire, start it on your machine and read your first article. You need
Node (the version in [.nvmrc](../../.nvmrc)) with Corepack enabled, and nothing else: no account,
no token, no `.env.local`.

## Install

Clone the repository and install the dependencies:

```sh
git clone <repository-url> lire
cd lire
corepack enable
yarn
```

## Start the app

```sh
yarn dev
```

Vite prints a local address. Open <http://localhost:3000>.

Lire starts in mock mode, so it reads the bundled seed fixtures instead of calling a server. You
do not configure anything for that.

## Read something

1. The app opens on `/stream/all` with the Navigator closed. Open it from the search pill
   ("Search all articles, feeds…"). The collections list comes from the seed data.
2. Pick a collection. Its articles load as a stream.
3. Open an article. The reader view shows its content.
4. Select "Mark as read". The reader closes and the card shows "Mark as unread". Open the
   Navigator again from the search pill: the count on "All articles" dropped by one.

Reload the page. The seed data is static, so the collections and articles are the same as before.

## What you have

- A running dev server with hot reload on port 3000.
- A working reader over the seed fixtures, with no network and no credentials.

## Next

- Run the checks you will want before a commit: [Run the tests](../how-to/run-the-tests.md).
- Use your own feeds instead of the seed: [Record the fixtures](../how-to/record-fixtures.md).
- Learn the code style: [Conventions](../reference/conventions.md).
- See how the pieces fit: [Architecture](../explanation/architecture.md).
