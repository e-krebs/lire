# 0011. Embed YouTube and X in blog posts as iframes

## Status

Accepted

## Context

[ADR 0007](0007-newsletter-iframe.md) keeps scripts and frames out of article bodies: DOMPurify
drops every `iframe` and `script`. Blog posts that quote a video or a post then show nothing where
the embed was. X's own embed is a `blockquote` plus `widgets.js`. That script would run in Lire's
origin, next to the session state the app holds, which is a trade the reader does not make for a
tweet.

## Decision

Blog posts keep two kinds of frame, and every other frame is removed. `Reader` decides whether a
body is a newsletter before it sanitizes, so the embed rules never reach the newsletter pass.

- **YouTube.** A frame survives when its host is `youtube.com`, `www.youtube.com` or
  `www.youtube-nocookie.com` and its path is `/embed/<id>`. The sanitizer rewrites the source to
  `https://www.youtube.com/embed/<id>`. The plain `youtube.com` host is deliberate: it keeps Watch
  later and the viewer's signed-in state working, which `youtube-nocookie.com` does not.
- **X.** A `blockquote.twitter-tweet` whose links include a `/<user>/status/<digits>` URL on
  `twitter.com` or `x.com` is replaced, after sanitizing, by a frame on
  `https://platform.twitter.com/embed/Tweet.html?id=<id>&dnt=true`. Lire builds the frame from the
  checked id, so a feed's own X frame is still dropped. `widgets.js` never loads.

Both frames carry a sandbox with `allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox`.
The frames are cross-origin, so `allow-same-origin` gives them their own origin and no access to
Lire's. The helpers are in `src/client/utils/embeds.ts`.

## Consequences

- Google and X see the reading: the frame loads when the post renders, and `dnt=true` only asks X to
  limit tracking.
- The YouTube hooks run on their own DOMPurify instance, so the newsletter pass never applies them.
  The link target and `rel` hook is on both.
- A feed's own X frame is dropped, and only the quote form embeds.
- Embeds stay off until the feed list loads.
- The X frame title is the tweet text, cut at 140 characters, or "X" when empty.
- The X frame is 32rem tall and at most 550px wide, under the same 60vh cap as the YouTube frame.
- A future CSP must allow `youtube.com` and `platform.twitter.com` frames.
- Newsletters are unchanged: they keep the sandbox without `allow-scripts` and drop every frame.
- Detail: [architecture](../explanation/architecture.md).
