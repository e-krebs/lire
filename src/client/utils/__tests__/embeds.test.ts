import { describe, expect, it } from "vitest";
import { embedQuotes, iframeEmbed } from "../embeds";

const YOUTUBE = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const BSKY_URI = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3l6oveex3ii2l";
const BSKY_FRAME =
  "https://embed.bsky.app/embed/did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3l6oveex3ii2l";
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
      expect(iframeEmbed({ src })?.src).toBe(YOUTUBE);
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
      expect(iframeEmbed({ src })?.name).not.toBe("youtube");
    }
  });

  it("embedQuotes builds the X frame from a twitter.com or x.com status link", () => {
    for (const host of ["twitter.com", "x.com"]) {
      const html = `<blockquote class="twitter-tweet"><a href="https://${host}/jack/status/1234567890?ref_src=x">May 1</a></blockquote>`;
      expect(embedQuotes({ html })).toContain(`src="${TWEET.replace("&", "&amp;")}"`);
    }
  });

  it("embedQuotes keeps links that are not a status", () => {
    for (const href of [
      "https://twitter.com/jack",
      "https://twitter.com/hashtag/lire",
      "https://x.com/jack/status/abc",
      "https://evil.test/jack/status/1234567890",
      "javascript:alert(1)",
    ]) {
      const html = `<blockquote class="twitter-tweet"><a href="${href}">Jack</a></blockquote>`;
      expect(embedQuotes({ html })).not.toContain("<iframe");
    }
  });

  it("embedQuotes replaces a tweet blockquote with a sandboxed X frame", () => {
    const html = embedQuotes({
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

  it("embedQuotes keeps a tweet blockquote with no usable link, and any other blockquote", () => {
    const html =
      '<blockquote class="twitter-tweet"><a href="https://twitter.com/jack">Jack</a></blockquote>' +
      '<blockquote><a href="https://twitter.com/jack/status/1">a quote</a></blockquote>';
    expect(embedQuotes({ html })).toBe(html);
  });

  it("vimeoEmbedUrl rebuilds the player source with dnt and a hex h only", () => {
    expect(iframeEmbed({ src: "https://player.vimeo.com/video/22439234?autoplay=1" })?.src).toBe(
      "https://player.vimeo.com/video/22439234?dnt=1",
    );
    expect(iframeEmbed({ src: "//player.vimeo.com/video/22439234/?h=0a1b2c&title=0" })?.src).toBe(
      "https://player.vimeo.com/video/22439234?h=0a1b2c&dnt=1",
    );
    expect(iframeEmbed({ src: "https://player.vimeo.com/video/1?h=zz%22%3E" })?.src).toBe(
      "https://player.vimeo.com/video/1?dnt=1",
    );
  });

  it("vimeoEmbedUrl rejects page links, other hosts and non-digit ids", () => {
    for (const src of [
      "https://vimeo.com/22439234",
      "https://player.vimeo.com/video/abc",
      "https://player.vimeo.com/video/1/2",
      "https://player.vimeo.com.evil.test/video/1",
      "https://evil.test/video/1",
      "javascript:alert(1)",
    ]) {
      expect(iframeEmbed({ src })).toBeNull();
    }
  });

  it("embedQuotes builds the Bluesky frame from data-bluesky-uri", () => {
    const html = embedQuotes({
      html: `<blockquote class="bluesky-embed" data-bluesky-uri="${BSKY_URI}"><p>Hello Bluesky</p></blockquote>`,
    });
    const doc = new DOMParser().parseFromString(html, "text/html");

    expect(doc.querySelector("blockquote")).toBeNull();
    const frame = doc.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(BSKY_FRAME);
    expect(frame?.getAttribute("data-embed")).toBe("bluesky");
    expect(frame?.getAttribute("title")).toContain("Hello Bluesky");
  });

  it("embedQuotes keeps a Bluesky blockquote whose uri is missing or malformed", () => {
    for (const uri of [
      null,
      "at://did:plc:abc/app.bsky.graph.list/3l6oveex3ii2l",
      "at://did:plc:a/b/app.bsky.feed.post/3l6oveex3ii2l",
      "at://did:plc:abc/app.bsky.feed.post/3l6/x",
      "https://bsky.app/profile/bsky.app/post/3l6oveex3ii2l",
    ]) {
      const attr = uri === null ? "" : ` data-bluesky-uri="${uri}"`;
      const html = `<blockquote class="bluesky-embed"${attr}><p>Hi</p></blockquote>`;
      expect(embedQuotes({ html })).toBe(html);
    }
  });
});
