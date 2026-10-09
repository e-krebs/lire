# 0007. Render newsletters in a sandboxed iframe

## Status

Accepted

## Context

Two newsletters broke the reader when it styled their bodies inline with `.prose-reader`. "Bytes"
overflowed a 390px phone, because the reader's `table-layout: fixed` rule could not shrink a
`width: 600px` cell. "Serious gaming" had its 19px icons stretched to 60px by the `table img`
override, and its inline `color: #000` text was unreadable on the dark theme. The previous upstream removes an
email's `<style>` blocks, so the emails bring no phone rules of their own.

## Decision

A body is a newsletter when its sanitized HTML holds an element with class `webfeeds--newsletter`,
which the previous upstream adds to every email feed body. The reader renders it in a `srcdoc` iframe with the
browser's default styles, on a full-width band. Blog posts stay inline with `.prose-reader`, and the
table overrides are gone.

The page follows the dark theme only when the email sets no colors of its own. An email that sets a
color assumes a white page: "Serious gaming" writes `color: #000` inline and sets no background, so
a black default would hide its text. The frame scans the sanitized HTML for a `style` attribute
naming `color` or `background`, and for a `bgcolor` or `color` attribute, which covers
`<font color>`. With none, the frame's `color-scheme` meta is `light dark` and its default page is
`light-dark(#fff, #000)` with the opposite text color. With any, the meta stays `light` and the
page is white, and in the dark scheme an invert filter (`invert(1) hue-rotate(180deg)`) turns it
dark, while `img`, `video` and `svg` get the same filter again to restore their colors after the
invert. CSS background images and color emoji stay inverted. The band behind the frame follows the
scheme too. The filter keeps the senders' colors and the white-page assumption intact through the
invert. The second pass restores photos only approximately, because the hue rotate clips saturated
colors. A false match only inverts an email that would have worked natively.

The sandbox is exactly `allow-same-origin allow-popups allow-popups-to-escape-sandbox`, never
`allow-scripts`. The parent reads the iframe document, so no script runs in the frame while the
parent can still do four things. It sizes the frame to the height of the document's root element and
keeps it current with a `ResizeObserver` from the frame's own window. The frame always fits its
content. It forwards each `keydown` to the parent `document`, so Escape closes the reader from
inside the frame; keys typed in a field or during IME composition are not forwarded. It replaces a
failed image with the broken-image placeholder. It also routes link clicks through the
external-browser preference, as on the parent document. It sets all of this up once the document is
parsed, not on `load`, which waits for every image. DOMPurify still sanitizes the HTML before it
enters `srcdoc`, so the sandbox is a second layer. An email wider than the frame is scaled down to
fit: the parent zooms the frame body by the ratio of the frame width to the email's natural width.
CSS `zoom`, unlike `transform`, changes layout size, so the height measure stays right.

## Consequences

- Emails with colors of their own keep their layout in the dark theme through an invert filter.
  Uncolored emails follow it natively.
- Brand colors shift by the hue rotate, and a logo image keeps its own colors.
- A dark logo on a transparent background, in an uncolored email, can fade into the dark page.
- Height, key forwarding and the broken-image placeholder depend on `allow-same-origin`.
- A zoomed email's text can get small, because the scale has no floor. `overflow-x: auto` stays on the
  frame as a fallback.
- An unzoomed email sized in `vh` can grow without end, because the frame has no height cap.
- Adding `allow-scripts` beside `allow-same-origin`, or removing DOMPurify, voids the sandbox.
- A future CSP must allow `srcdoc` frames.
- Blog posts keep `.prose-reader`.
- Inline overrides were tried first and lost the senders' brand colors.
- Blog posts embed videos and posts (YouTube, Vimeo, X, Bluesky, Instagram, Threads, TikTok) as frames, and newsletters do not: see
  [ADR 0011](0011-reader-embeds.md).
- Detail: [architecture](../explanation/architecture.md).
