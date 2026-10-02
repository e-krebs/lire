# 0009. Render newsletters in a sandboxed iframe

## Status

Accepted

## Context

Two newsletters broke the reader when it styled their bodies inline with `.prose-reader`. "Bytes"
overflowed a 390px phone, because the reader's `table-layout: fixed` rule could not shrink a
`width: 600px` cell. "Serious gaming" had its 19px icons stretched to 60px by the `table img`
override, and its inline `color: #000` text was unreadable on the dark theme. Feedly removes an
email's `<style>` blocks, so the emails bring no phone rules of their own.

## Decision

A body is a newsletter when its sanitized HTML holds an element with class `webfeeds--newsletter`,
which Feedly adds to every email feed body. The reader renders it in a `srcdoc` iframe with the
browser's default styles, on a full-width white band with `color-scheme: light` in both themes. Blog
posts stay inline with `.prose-reader`, and the table overrides are gone.

The sandbox is exactly `allow-same-origin allow-popups allow-popups-to-escape-sandbox`, never
`allow-scripts`. The parent reads the iframe document, so no script runs in the frame while the
parent can still do four things. It sizes the frame to the height of the document's root element
and keeps it current with a `ResizeObserver` from the frame's own window. The height stops at 20,000
px and the frame scrolls inside past that, because an email sized in `vh` units reads the frame's
own height and would otherwise grow without end. It forwards each `keydown` to the parent
`document`, so Escape closes the reader from inside the frame; keys typed in a field or during IME
composition are not forwarded. It replaces a failed image with the broken-image
placeholder. It also routes link clicks through the external-browser preference, as on the parent
document. It sets all of this up once the document is parsed, not on `load`, which waits for every
image. DOMPurify still sanitizes the HTML before it enters `srcdoc`, so the sandbox is a
second layer. An email wider than the panel scrolls sideways inside the frame instead of scaling.

## Consequences

- Emails look as their senders designed them and do not follow the dark theme.
- Height, key forwarding and the broken-image placeholder depend on `allow-same-origin`.
- Past 20,000 px the frame scrolls inside, nested in the reader pane. An email sized in `vh` plus a
  fixed extra still grows to the cap and ends as a tall, mostly empty band.
- Adding `allow-scripts` beside `allow-same-origin`, or removing DOMPurify, voids the sandbox.
- A future CSP must allow `srcdoc` frames.
- Blog posts keep `.prose-reader`.
- Inline overrides were tried first and lost the senders' brand colors.
- Detail: [architecture](../explanation/architecture.md).
