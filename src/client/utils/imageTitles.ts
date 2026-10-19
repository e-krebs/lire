export const INLINE_WRAPPERS = new Set([
  "A",
  "SPAN",
  "EM",
  "STRONG",
  "B",
  "I",
  "U",
  "SMALL",
  "MARK",
]);

// A hover tooltip is unreachable on touch, and xkcd's punchline lives there, so it prints below the
// image. Only a lone image (`data-lone`, set by the reader's sanitizer): in a line of text a block
// caption would break the line. A run image prints no caption, because the box would split the strip.
// Runs on sanitized markup, parsed into its own inert document.
export const captionImageTitles = ({ html }: { html: string }): string => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  for (const img of doc.querySelectorAll("img[data-lone]:not([data-run])[title]")) {
    const title = img.getAttribute("title")?.trim() ?? "";
    if (title === "") continue;
    let outer: Element = img;
    while (outer.parentElement && INLINE_WRAPPERS.has(outer.parentElement.tagName)) {
      outer = outer.parentElement;
    }
    const caption = doc.createElement("span");
    caption.className = "img-title";
    caption.textContent = title;
    const box = doc.createElement("span");
    box.className = "img-titled";
    outer.replaceWith(box);
    box.append(outer, caption);
    changed = true;
  }
  return changed ? doc.body.innerHTML : html;
};
