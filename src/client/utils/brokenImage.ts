const SVG_NS = "http://www.w3.org/2000/svg";

// Called on images from other windows too (the newsletter iframe), hence `tagName`, not instanceof.
export const replaceBrokenImage = (img: Element): void => {
  if (img.tagName !== "IMG") return;
  const width = Number(img.getAttribute("width"));
  const height = Number(img.getAttribute("height"));
  // 1x1 tracking pixels fail under ad blockers; they are not worth a placeholder.
  if ((img.hasAttribute("width") && width <= 1) || (img.hasAttribute("height") && height <= 1)) {
    img.remove();
    return;
  }

  const doc = img.ownerDocument;
  const alt = img.getAttribute("alt")?.trim() ?? "";
  const text = alt || "Image unavailable";

  const icon = doc.createElementNS(SVG_NS, "svg");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("width", "1.25em");
  icon.setAttribute("height", "1.25em");
  icon.style.opacity = "0.6";
  const use = doc.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `${import.meta.env.BASE_URL}icons.svg#image-off`);
  icon.append(use);

  const label = doc.createElement("span");
  label.textContent = text;

  const box = doc.createElement("span");
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", alt ? `Image unavailable: ${alt}` : "Image unavailable");
  box.style.cssText =
    "display: flex; align-items: center; justify-content: center; gap: 0.5em; width: fit-content; max-width: 100%; margin: 0.75em auto; padding: 0.5em 0.75em; border: 1px dashed color-mix(in srgb, currentColor 40%, transparent); border-radius: 0.5rem; font-size: 0.875em";
  box.append(icon, label);

  img.replaceWith(box);
};
