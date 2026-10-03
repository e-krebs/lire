import { describe, expect, it } from "vitest";
import { embedTweets, youtubeEmbedUrl } from "../embeds";

const YOUTUBE = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const TWEET = "https://platform.twitter.com/embed/Tweet.html?id=1234567890&dnt=true";

describe("embeds", () => {
  it("youtubeEmbedUrl rewrites every accepted embed form to the plain youtube.com one", () => {
    for (const src of [
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://youtube.com/embed/dQw4w9WgXcQ?start=30",
      "http://www.youtube.com/embed/dQw4w9WgXcQ/",
      "//www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    ]) {
      expect(youtubeEmbedUrl({ src })).toBe(YOUTUBE);
    }
  });

  it("youtubeEmbedUrl rejects other hosts, other paths and other schemes", () => {
    for (const src of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.test/embed/dQw4w9WgXcQ",
      "https://player.vimeo.com/video/1",
      "https://www.youtube.com/embed/a/b",
      "javascript:alert(1)",
      "data:text/html,<p>hi</p>",
      "",
    ]) {
      expect(youtubeEmbedUrl({ src })).toBeNull();
    }
  });

  it("embedTweets builds the X frame from a twitter.com or x.com status link", () => {
    for (const host of ["twitter.com", "x.com"]) {
      const html = `<blockquote class="twitter-tweet"><a href="https://${host}/jack/status/1234567890?ref_src=x">May 1</a></blockquote>`;
      expect(embedTweets({ html })).toContain(`src="${TWEET.replace("&", "&amp;")}"`);
    }
  });

  it("embedTweets keeps links that are not a status", () => {
    for (const href of [
      "https://twitter.com/jack",
      "https://twitter.com/hashtag/lire",
      "https://x.com/jack/status/abc",
      "https://evil.test/jack/status/1234567890",
      "javascript:alert(1)",
    ]) {
      const html = `<blockquote class="twitter-tweet"><a href="${href}">Jack</a></blockquote>`;
      expect(embedTweets({ html })).not.toContain("<iframe");
    }
  });

  it("embedTweets replaces a tweet blockquote with a sandboxed X frame", () => {
    const html = embedTweets({
      html:
        '<p>Before</p><blockquote class="twitter-tweet"><p>Hello <a href="https://twitter.com/other/status/1">quoted</a></p>' +
        '&mdash; Jack <a href="https://twitter.com/jack/status/1234567890">May 1</a></blockquote>',
    });
    const doc = new DOMParser().parseFromString(html, "text/html");

    expect(doc.querySelector("blockquote")).toBeNull();
    // A DOMParser document is another realm, which jest-dom's matchers reject.
    const frame = doc.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(TWEET);
    expect(frame?.getAttribute("data-embed")).toBe("x");
    expect(frame?.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox",
    );
    expect(frame?.getAttribute("title")).toContain("Hello");
    expect(doc.body.textContent).toContain("Before");
  });

  it("embedTweets keeps a tweet blockquote with no usable link, and any other blockquote", () => {
    const html =
      '<blockquote class="twitter-tweet"><a href="https://twitter.com/jack">Jack</a></blockquote>' +
      '<blockquote><a href="https://twitter.com/jack/status/1">a quote</a></blockquote>';
    expect(embedTweets({ html })).toBe(html);
  });
});
