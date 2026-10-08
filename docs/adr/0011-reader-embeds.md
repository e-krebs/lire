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

Blog posts keep eight kinds of frame, and every other frame is removed. `Reader` decides whether a
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
- **Instagram.** A `blockquote.instagram-media` whose `data-instgrm-permalink`, or else its last
  link, is an `instagram.com` or `www.instagram.com` URL with the path `/(<user>/)?(p|reel)/<code>/`
  is replaced, after sanitizing, by a frame on `https://www.instagram.com/<p or reel>/<code>/embed/`.
- **Threads.** A `blockquote.text-post-media` whose `data-text-post-permalink`, or else its last
  link, is a `threads.com` or `threads.net` URL (with or without `www.`) with the path
  `/@<user>/post/<code>` is replaced by a frame on
  `https://www.threads.com/@<user>/post/<code>/embed`.
- **TikTok.** A `blockquote.tiktok-embed` whose `cite`, or else its last link, is a `tiktok.com` or
  `www.tiktok.com` URL with the path `/@<user>/video/<digits>` is replaced by a frame on
  `https://www.tiktok.com/embed/v2/<id>`.
- **Facebook.** A `div.fb-post` or `div.fb-video` whose `data-href` is a `facebook.com`,
  `www.facebook.com` or `m.facebook.com` URL is replaced by a frame on
  `https://www.facebook.com/plugins/post.php?href=<url>` or `.../plugins/video.php?href=<url>`. A
  post path is `/<page>/posts/<id>` or `/permalink.php?story_fbid=<digits>&id=<digits>`. A video
  path is `/<page>/videos/<digits>`, `/reel/<digits>` or `/watch/?v=<digits>`. A feed's own
  `plugins/post.php` or `plugins/video.php` frame survives when its inner `href` passes the same
  check, and the sanitizer rebuilds the source from it. `fb.watch` short links stay plain links,
  because a short link cannot resolve client side.

Lire builds the Instagram, Threads and TikTok frames from the checked permalink and a fixed host,
so their `embed.js` never loads either. A quote whose permalink fails its check stays a quote.

All frames carry a sandbox with `allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox`.
The frames are cross-origin, so `allow-same-origin` gives them their own origin and no access to
Lire's. The helpers are in `src/client/utils/embeds.ts`.

## Consequences

- Google, X, Vimeo, Bluesky, Instagram, Threads, TikTok and Facebook see the reading: the frame loads when
  the post renders, and `dnt=true` or `dnt=1` only asks X and Vimeo to limit tracking.
- Instagram, Threads, TikTok and Facebook frames are the heaviest: they run the provider's own scripts and
  set cookies as soon as they load. The provider sees the reader's IP for every such post shown,
  whether or not the reader wanted the embed. No click gate holds them back, and no choice is
  remembered.
- The frame hooks run on their own DOMPurify instance, so the newsletter pass never applies them.
  The link target and `rel` hook is on both.
- A feed's own X frame is dropped, and only the quote form embeds.
- Embeds stay off until the feed list loads.
- The X frame title is the tweet text, cut at 140 characters, or "X" when empty.
- The X frame starts 32rem tall and at most 550px wide, with no 60vh cap. The frame posts a
  `twttr.private.resize` message (`{"twttr.embed": {method, params: [{width, height}]}}`, an object or
  its JSON string) from `https://platform.twitter.com` once the tweet renders, and `Reader` sets the
  height from it so the tweet has no inner scrollbar. It accepts the message only from that origin
  and from a reader X frame's own window, and clamps the height to 120 to 4000px.
- The Bluesky frame is 32rem tall and at most 600px wide, and the Vimeo frame is 16 by 9 like YouTube.
- The Instagram frame is 44rem tall and at most 540px wide, the Threads frame 36rem and 540px, and
  the TikTok frame is 9 by 16 and at most 325px wide, all under the same 60vh cap as the others.
- The Facebook post frame is 40rem tall and at most 500px wide, and it lifts the 60vh cap because
  a post card cut short loses its picture. The Facebook video frame is 16 by 9 and at most 560px
  wide, under the cap.
- A future CSP must allow `youtube.com`, `platform.twitter.com`, `player.vimeo.com`,
  `embed.bsky.app`, `www.instagram.com`, `www.threads.com`, `www.tiktok.com` and `www.facebook.com` frames.
- Newsletters are unchanged: they keep the sandbox without `allow-scripts` and drop every frame.
- Detail: [architecture](../explanation/architecture.md).
