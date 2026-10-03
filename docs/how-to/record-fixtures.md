# Record the fixtures

Replace the synthetic seed with your own NewsBlur data. Background on the two sets is in
[Fixtures](../reference/fixtures.md).

## Record

1. Copy the sample env file:

   ```sh
   cp .env.sample .env.local
   ```

2. Set `NEWSBLUR_USERNAME` and `NEWSBLUR_PASSWORD` in `.env.local` to your NewsBlur login.
3. Run the recorder:

   ```sh
   yarn fixtures:record
   ```

The script logs in with `POST /api/login` and keeps the session cookie, with the same username and
password the Worker uses. It calls the same upstream endpoints as the fake NewsBlur, reads at most three
pages of stories per feed, and writes `fixtures/real/`, which is gitignored. A wrong password
answers `200` with `code: -1`, and the script stops on it. Never run it in CI.

The recorder writes into `fixtures/real.tmp/` first. When every required file has been written,
it deletes `fixtures/real/` and renames the scratch directory into its place. A run that fails
partway leaves the previous `fixtures/real/` untouched.

## Use the recorded set

With a complete `fixtures/real/`, `yarn dev` in mock mode serves it instead of the seed. No flag
is needed.

## Force the seed

Set `VITE_FIXTURES=seed` in `.env.local` (or in the shell) and restart the dev server. The seed
is used even when `fixtures/real/` exists. The demo build sets this itself.
