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

An email with more `class` attributes than `style` attributes and no `<table>` lost its `<style>`
block upstream, and its column and rhythm went with it. The frame gives that email a centered 42rem
column, a 1rem gutter, a 1.55 line height, heading sizes, link colors, and spacing for lists,
quotes and code, and a status line above the frame says so. Any other email keeps the browser's
defaults.

The page follows the dark theme only when the email sets no colors of its own. An email that sets a
color assumes a white page: "Serious gaming" writes `color: #000` inline and sets no background, so
a black default would hide its text. The frame scans the sanitized HTML for a `style` attribute
naming `color` or `background`, and for a `bgcolor` or `color` attribute, which covers
`<font color>`. With none, the frame's `color-scheme` meta is `light dark` and its default page is
`light-dark(#fff, #000)` with the opposite text color. With any and no page background of its own,
the meta stays `light` and the page is white, and in the dark scheme an invert filter (`invert(1)`) turns it
dark, while `img`, `video` and `svg` get the same filter again to restore their colors after the
invert. A plain invert is its own inverse, so the restore is exact; a `hue-rotate` in the pair
clipped saturated colors and shifted reds. Emoji in the text are wrapped in a span by the parent once the document is parsed, and that
span gets the same filter, so its color survives; the pass runs only for a colored email. CSS
background images stay inverted, and so does an emoji inside SVG text, which the pass skips. The band behind the frame follows the
scheme too. The filter keeps the white-page assumption intact through the
invert. Saturated colors keep their hue: once the document is parsed, the parent gives an element a
`--lire-ink`, `--lire-bg`, `--lire-deco` or `--lire-border-<side>` property holding the inverse color,
which the invert turns back into the original. This covers text, backgrounds, borders and underlines.
An element that draws a line gets the same treatment as its text, as the line takes the color of the
element that sets it, which can wrap the text's own parent. Text inside a kept
background keeps its color too, so white on a blue button stays white. A text color darker than 0.15
relative luminance inverts with the page, as it would vanish on black, and so do grays. The
browser's default link blue is stored as the inverse of `#8ab4f8`. A false match only inverts an email that would have worked natively. An email with a page background
of its own, a non-white and opaque one, keeps its colors in the dark scheme with no invert. The
page is read from the root table: the first top-level visible table, which skips a hidden preheader
table, else the first element. Its inline `background-color` or `background` wins over `bgcolor`,
and a color counts when its alpha is 1 and its relative luminance is under 0.9.

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

- Emails with colors of their own on a white page keep their layout in the dark theme through an
  invert filter. Uncolored emails follow it natively, and an email with its own non-white page keeps
  its colors.
- A bright email with its own page in a dark UI stays bright, and the luminance test can misfire: a
  page just above the ceiling reads as white and is inverted, and a translucent page reads as none.
- Saturated colors keep their hue with no hue rotate, and grays invert. A gradient or a CSS
  background image still inverts, and a dark text color on a plain background inverts to a light hue.
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
  [ADR 0010](0010-reader-embeds.md).
- Detail: [architecture](../explanation/architecture.md).
