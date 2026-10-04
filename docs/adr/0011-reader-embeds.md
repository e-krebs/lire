# 0011. Embed videos and posts in blog posts as iframes

## Status

Accepted

## Context

[ADR 0007](0007-newsletter-iframe.md) keeps scripts and frames out of article bodies: DOMPurify
drops every `iframe` and `script`. Blog posts that quote a video or a post then show nothing where
the embed was. X's own embed is a `blockquote` plus `widgets.js`. That script would run in Lire's
origin, next to the session state the app holds, which is a trade the reader does not make for a
tweet.

## Decision

Blog posts keep four kinds of frame, and every other frame is removed. `Reader` decides whether a
body is a newsletter before it sanitizes, so the embed rules never reach the newsletter pass.

- **YouTube.** A frame survives when its host is `youtube.com`, `www.youtube.com` or
  `www.youtube-nocookie.com` and its path is `/embed/<id>`. The sanitizer rewrites the source to
  `https://www.youtube.com/embed/<id>`. The plain `youtube.com` host is deliberate: it keeps Watch
  later and the viewer's signed-in state working, which `youtube-nocookie.com` does not.
- **X.** A `blockquote.twitter-tweet` whose links include a `/<user>/status/<digits>` URL on
  `twitter.com` or `x.com` is replaced, after sanitizing, by a frame on
  `https://platform.twitter.com/embed/Tweet.html?id=<id>&dnt=true`. Lire builds the frame from the
  checked id, so a feed's own X frame is still dropped. `widgets.js` never loads.

- **Vimeo.** A frame survives when its host is `player.vimeo.com` and its path is
  `/video/<digits>`. The sanitizer rewrites the source to `https://player.vimeo.com/video/<id>?dnt=1`
  and keeps an `h` value only when it is hexadecimal, because an unlisted video needs it. A
  `vimeo.com/<id>` page link is not a frame.
- **Bluesky.** A `blockquote.bluesky-embed` whose `data-bluesky-uri` is
  `at://<did>/app.bsky.feed.post/<rkey>` is replaced, after sanitizing, by a frame on
  `https://embed.bsky.app/embed/<did>/app.bsky.feed.post/<rkey>`. Lire builds the frame from the
  checked uri, so `embed.js` never loads. A quote with no valid uri stays a quote.

All frames carry a sandbox with `allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox`.
The frames are cross-origin, so `allow-same-origin` gives them their own origin and no access to
Lire's. The helpers are in `src/client/utils/embeds.ts`.

## Consequences

- Google, X, Vimeo and Bluesky see the reading: the frame loads when the post renders, and
  `dnt=true` or `dnt=1` only asks X and Vimeo to limit tracking.
- The YouTube hooks run on their own DOMPurify instance, so the newsletter pass never applies them.
  The link target and `rel` hook is on both.
- A feed's own X frame is dropped, and only the quote form embeds.
- Embeds stay off until the feed list loads.
- The X frame title is the tweet text, cut at 140 characters, or "X" when empty.
- The X frame is 32rem tall and at most 550px wide, under the same 60vh cap as the YouTube frame.
- The Bluesky frame is 32rem tall and at most 600px wide, and the Vimeo frame is 16 by 9 like YouTube.
- A future CSP must allow `youtube.com`, `platform.twitter.com`, `player.vimeo.com` and
  `embed.bsky.app` frames.
- Newsletters are unchanged: they keep the sandbox without `allow-scripts` and drop every frame.
- Detail: [architecture](../explanation/architecture.md).
