import { describe, expect, it } from "vitest";
import { markImageRuns } from "../imageRuns";

const NAMES = {
  "data-lone": "lone",
  "data-run": "run",
  "data-run-start": "start",
  "data-run-end": "end",
} as const;

// Each image, keyed by its alt, with the marks it carries.
const marks = (html: string): Record<string, string> => {
  const body = new DOMParser().parseFromString(markImageRuns({ html }), "text/html").body;
  return Object.fromEntries(
    [...body.querySelectorAll("img")].map((img) => [
      img.getAttribute("alt") ?? "",
      Object.entries(NAMES)
        .filter(([attr]) => img.hasAttribute(attr))
        .map(([, name]) => name)
        .join(" "),
    ]),
  );
};

const bodyOf = (html: string): HTMLElement =>
  new DOMParser().parseFromString(markImageRuns({ html }), "text/html").body;

describe("markImageRuns", () => {
  it("marks an image alone in its paragraph as lone, without a run", () => {
    expect(marks('<p><img alt="a"></p>')).toEqual({ a: "lone" });
  });

  it("does not mark an image in a line of text", () => {
    expect(marks('<p>Text <img alt="a"> more</p>')).toEqual({ a: "" });
  });

  it("does not mark an emoji, even alone in its paragraph", () => {
    expect(marks('<p><img class="emoji" alt="a"></p>')).toEqual({ a: "" });
  });

  it("marks a linked image alone in its paragraph as lone", () => {
    expect(marks('<p><a href="https://example.test/"><img alt="a"></a></p>')).toEqual({
      a: "lone",
    });
  });

  it("marks two images in one paragraph as a run", () => {
    expect(marks('<p><img alt="a"><img alt="b"></p>')).toEqual({
      a: "lone run start",
      b: "lone run end",
    });
  });

  it("marks a flat run and removes the br between its panels", () => {
    const html = '<img alt="a"><br><img alt="b"><br><img alt="c"><p>Text</p>';

    expect(marks(html)).toEqual({
      a: "lone run start",
      b: "lone run",
      c: "lone run end",
    });
    const body = bodyOf(html);
    expect(body.querySelectorAll("br")).toHaveLength(0);
    expect(body.querySelector("p")?.outerHTML).toBe("<p>Text</p>");
  });

  it("keeps a text line between two lone images from forming a run", () => {
    const html = '<img alt="a"><br>Text<br><img alt="b">';

    expect(marks(html)).toEqual({ a: "lone", b: "lone" });
    const body = bodyOf(html);
    expect(body.querySelectorAll("br")).toHaveLength(2);
    expect(body.textContent).toBe("Text");
  });

  it("does not mark images that share a line with text", () => {
    expect(marks('<img alt="a">Text<img alt="b">')).toEqual({ a: "", b: "" });
  });

  it("keeps images in separate paragraphs apart, each lone", () => {
    expect(marks('<p><img alt="a"></p><p><img alt="b"></p>')).toEqual({
      a: "lone",
      b: "lone",
    });
  });

  it("ends a line at a block element, so the image after it starts a run", () => {
    expect(marks('<p>Text</p><img alt="a"><br><img alt="b">')).toEqual({
      a: "lone run start",
      b: "lone run end",
    });
  });

  it("keeps an image after inline code in the text line", () => {
    expect(marks('<p><code>label</code><img alt="a" title="tooltip"></p>')).toEqual({ a: "" });
  });

  it("breaks a run at an emoji line", () => {
    expect(marks('<img alt="a"><br><img class="emoji" alt="e"><br><img alt="b">')).toEqual({
      a: "lone",
      e: "",
      b: "lone",
    });
  });

  it("gives a single lone image no run mark", () => {
    expect(marks('<img alt="a"><br>')).toEqual({ a: "lone" });
  });

  it("marks linked images on their own lines as a run", () => {
    expect(
      marks(
        '<a href="https://example.test/a"><img alt="a"></a><br>' +
          '<a href="https://example.test/b"><img alt="b"></a>',
      ),
    ).toEqual({ a: "lone run start", b: "lone run end" });
  });

  it("marks several images inside one link as a run of two", () => {
    expect(marks('<a href="https://example.test/"><img alt="a"><img alt="b"></a>')).toEqual({
      a: "lone run start",
      b: "lone run end",
    });
  });

  it("does not mark an image after a br inside a span that holds text", () => {
    expect(marks('<span>Text<br><img alt="a"></span>')).toEqual({ a: "" });
  });

  it("returns the input as is when it holds no image", () => {
    const html = "<p>Text</p><br>";
    expect(markImageRuns({ html })).toBe(html);
  });
});
