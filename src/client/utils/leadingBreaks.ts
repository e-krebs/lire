const WRAPPERS = new Set(["P", "DIV", "SPAN"]);

const isBlank = (node: Node): boolean => {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").trim() === "";
  if (!(node instanceof Element)) return false;
  if (node.tagName === "BR") return true;
  return (
    WRAPPERS.has(node.tagName) &&
    node.attributes.length === 0 &&
    node.querySelector(":not(br)") === null &&
    node.textContent.trim() === ""
  );
};

// Some feeds open their body with a few `<br>` that read as a gap above the first paragraph.
// Runs on sanitized markup, parsed into its own inert document.
export const stripLeadingBreaks = ({ html }: { html: string }): string => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  while (doc.body.firstChild && isBlank(doc.body.firstChild)) {
    doc.body.firstChild.remove();
    changed = true;
  }
  return changed ? doc.body.innerHTML : html;
};
