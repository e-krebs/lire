Synthetic NewsBlur answers, replayed by `createFakeNewsblur` (`src/client/api/adapters/fakeNewsblur.ts`) under the shared BFF core. Each file is the JSON body of one upstream call, shaped per `src/shared/bff/upstream.ts`.

- `feeds.json`: `/reader/feeds`. Four folders (`Tech` with a nested `Frameworks`, `Design`, `News`, `Newsletters`) and twelve feeds. Feed 103 sits in both `Tech` and `Design`, and feeds 111 and 112 are `newsletter:` feeds.
- `refresh_feeds.json`: `/reader/refresh_feeds`, the unread counts. The fake adjusts them as stories are marked read or unread.
- `stories/<feedId>.json`: the stories of one feed. Feed 101 holds eight, so a single feed pages (six a page). It carries the 100-character title and a long article with headings, a figure, a quote, code, a list and a table. Feed 109 is a long right-to-left article, feed 111 and 112 are nested-table newsletters with no permalink, and one story of feed 112 has no title.
- `read_stories.json`: `/reader/read_stories`, newest first. Its hashes match the stories whose `read_status` is 1.
- `feed_autocomplete.json`: `/rss_feeds/feed_autocomplete`.
- `preferences.json`: `/profile/get_preference`. Lire values are JSON-encoded strings.
- `profile.json`: `/social/load_user_profile`.

Content is fake (`*.example.test` sites), safe to commit and diff.
`fixtures/real/`, written by `scripts/record-fixtures.ts` from a live account, is gitignored and never committed.
