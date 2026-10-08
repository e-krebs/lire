import { describe, expect, it } from "vitest";
import { stripLeadingBreaks } from "../leadingBreaks";

const strip = (html: string) => stripLeadingBreaks({ html });

describe("leadingBreaks", () => {
  it("drops several leading br and the whitespace between them", () => {
    expect(
      strip('<br><br>\n<br> <p class="wp-block-paragraph">Margaret Hamilton, pionnière.</p>'),
    ).toBe('<p class="wp-block-paragraph">Margaret Hamilton, pionnière.</p>');
  });

  it("drops p, div and span wrappers that hold only br and whitespace", () => {
    expect(strip("<p><br></p><div> <br><br> </div><span><br></span><p>Text</p>")).toBe(
      "<p>Text</p>",
    );
  });

  it("drops text nodes made of non-breaking spaces", () => {
    expect(strip(" <br>  <p>Text</p>")).toBe("<p>Text</p>");
  });

  it("keeps a br that follows content", () => {
    expect(strip("<br><p>One</p><br><p>Two</p>")).toBe("<p>One</p><br><p>Two</p>");
    expect(strip("Text<br>more")).toBe("Text<br>more");
  });

  it("keeps a wrapper that holds an image or text", () => {
    expect(strip('<p><br><img src="a.png"></p>')).toBe('<p><br><img src="a.png"></p>');
    expect(strip("<div><br>Hi</div>")).toBe("<div><br>Hi</div>");
  });

  it("keeps an empty wrapper that carries a style", () => {
    const html = '<div style="height:200px"></div><p>Text</p>';
    expect(strip(html)).toBe(html);
  });

  it("keeps an empty element that carries an id", () => {
    const html = '<span id="anchor"></span><p>Text</p>';
    expect(strip(html)).toBe(html);
  });

  it("returns the input as is when nothing leads", () => {
    const html = "<p>Text</p><br>";
    expect(strip(html)).toBe(html);
    expect(strip("")).toBe("");
  });
});
