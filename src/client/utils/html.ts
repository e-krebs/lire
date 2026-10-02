/** Text-only snippet for a list row: strips tags and collapses whitespace, no sanitization. */
export const textSnippet = (html: string | undefined): string => {
  if (!html) return "";
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
};

/** Feedly returns some titles with HTML entities still escaped (`&nbsp;`, `&amp;`). */
export const decodeEntities = (text: string): string =>
  new DOMParser().parseFromString(text, "text/html").documentElement.textContent;
