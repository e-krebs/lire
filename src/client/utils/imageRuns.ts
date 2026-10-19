import { INLINE_WRAPPERS } from "client/utils/imageTitles";

type ImageLine = {
  images: HTMLImageElement[];
  start: Node;
  end: Node;
  section: number;
  lone: boolean;
};

const isBlankText = (node: Node): boolean =>
  node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() === "";

const imagesInUnit = (node: Node): HTMLImageElement[] | null => {
  if (!(node instanceof Element)) return null;
  if (node instanceof HTMLImageElement) {
    return node.classList.contains("emoji") ? null : [node];
  }
  if (!INLINE_WRAPPERS.has(node.tagName)) return null;

  const images: HTMLImageElement[] = [];
  for (const child of node.childNodes) {
    if (isBlankText(child) || (child instanceof Element && child.tagName === "BR")) continue;
    const nested = imagesInUnit(child);
    if (nested === null) return null;
    images.push(...nested);
  }
  return images.length > 0 ? images : null;
};

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "TABLE",
  "FIGURE",
  "FIGCAPTION",
  "HR",
  "SECTION",
  "ARTICLE",
  "ASIDE",
  "HEADER",
  "FOOTER",
  "DETAILS",
  "DL",
  "DD",
  "DT",
]);

const isBlock = (node: Node): node is Element =>
  node instanceof Element && BLOCK_TAGS.has(node.tagName);

// The pass runs after sanitization so it can see siblings without moving live DOM nodes.
export const markImageRuns = ({ html }: { html: string }): string => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const containers = new Set<Element>();
  for (const img of doc.querySelectorAll("img")) {
    let container = img.parentElement;
    while (container && INLINE_WRAPPERS.has(container.tagName)) container = container.parentElement;
    if (container) containers.add(container);
  }

  let changed = false;
  for (const container of containers) {
    const lines: ImageLine[] = [];
    let nodes: Node[] = [];
    let images: HTMLImageElement[] = [];
    let valid = true;
    let section = 0;

    const flush = (): void => {
      if (images.length > 0) {
        const units = nodes.filter((node) => imagesInUnit(node) !== null);
        lines.push({
          images,
          start: units[0],
          end: units[units.length - 1],
          section,
          lone: valid,
        });
      } else if (!valid) {
        lines.push({
          images: [],
          start: nodes[0],
          end: nodes[nodes.length - 1],
          section,
          lone: false,
        });
      }
      nodes = [];
      images = [];
      valid = true;
    };

    for (const node of container.childNodes) {
      if (node instanceof Element && node.tagName === "BR") {
        flush();
        continue;
      }
      if (isBlock(node)) {
        flush();
        section += 1;
        continue;
      }
      nodes.push(node);
      if (isBlankText(node)) continue;
      const unitImages = imagesInUnit(node);
      if (unitImages === null) valid = false;
      else images.push(...unitImages);
    }
    flush();

    for (const line of lines) {
      if (!line.lone) continue;
      for (const img of line.images) {
        img.setAttribute("data-lone", "");
        changed = true;
      }
    }

    for (let index = 0; index < lines.length;) {
      const first = lines[index];
      if (!first.lone) {
        index += 1;
        continue;
      }
      let lastIndex = index;
      let count = first.images.length;
      while (lastIndex + 1 < lines.length) {
        const next = lines[lastIndex + 1];
        if (!next.lone || next.section !== first.section) break;
        count += next.images.length;
        lastIndex += 1;
      }
      if (count >= 2) {
        const run = lines.slice(index, lastIndex + 1);
        const runImages = run.flatMap(({ images: lineImages }) => lineImages);
        runImages.forEach((img, imageIndex) => {
          img.setAttribute("data-run", "");
          if (imageIndex === 0) img.setAttribute("data-run-start", "");
          if (imageIndex === runImages.length - 1) img.setAttribute("data-run-end", "");
        });
        for (let runIndex = 0; runIndex < run.length - 1; runIndex += 1) {
          const current = run[runIndex];
          const next = run[runIndex + 1];
          let node = current.end.nextSibling;
          while (node && node !== next.start) {
            const after = node.nextSibling;
            if (node instanceof Element && node.tagName === "BR") node.remove();
            else if (isBlankText(node)) node.remove();
            node = after;
          }
        }
        changed = true;
      }
      index = lastIndex + 1;
    }
  }

  return changed ? doc.body.innerHTML : html;
};
