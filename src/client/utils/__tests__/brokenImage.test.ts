import { beforeEach, describe, expect, it } from "vitest";
import { replaceBrokenImage } from "../brokenImage";

const SVG_NS = "http://www.w3.org/2000/svg";

const setup = (attrs: Record<string, string>) => {
  const host = document.createElement("div");
  const img = document.createElement("img");
  host.append(img);
  document.body.append(host);
  for (const [name, value] of Object.entries(attrs)) img.setAttribute(name, value);
  replaceBrokenImage(img);
  return host;
};

describe("replaceBrokenImage", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("swaps the image for a placeholder showing the alt text", () => {
    const host = setup({ alt: "A cat" });
    const box = host.querySelector("[role=img]");
    expect(host.querySelector("img")).toBeNull();
    expect(box?.textContent).toBe("A cat");
    expect(box?.getAttribute("aria-label")).toBe("Image unavailable: A cat");
  });

  it("falls back to a generic label with an empty alt", () => {
    const box = setup({ alt: "" }).querySelector("[role=img]");
    expect(box?.textContent).toBe("Image unavailable");
    expect(box?.getAttribute("aria-label")).toBe("Image unavailable");
  });

  it("removes a 1x1 tracking pixel with no placeholder", () => {
    const host = setup({ width: "1", height: "1" });
    expect(host.children).toHaveLength(0);
  });

  it("draws the icon with an SVG-namespaced use", () => {
    const use = setup({ alt: "x" }).querySelector("use");
    expect(use?.namespaceURI).toBe(SVG_NS);
    expect(use?.getAttribute("href")).toMatch(/icons\.svg#image-off$/);
  });
});
