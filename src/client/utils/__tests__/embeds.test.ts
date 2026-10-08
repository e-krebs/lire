import { describe, expect, it } from "vitest";
import { embedQuotes, iframeEmbed, xResizeHeight } from "../embeds";

const YOUTUBE = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const BSKY_URI = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3l6oveex3ii2l";
const BSKY_FRAME =
  "https://embed.bsky.app/embed/did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3l6oveex3ii2l";
const IG_POST = "https://www.instagram.com/p/C0b8bKxLw5Q/?utm_source=ig_embed&utm_campaign=loading";
const IG_FRAME = "https://www.instagram.com/p/C0b8bKxLw5Q/embed/";
const THREADS_POST = "https://www.threads.com/@zuck/post/C8xv0k3PzZ2";
const TIKTOK_POST = "https://www.tiktok.com/@scout2015/video/6718335390845095173";
const FB_POST = "https://www.facebook.com/zuck/posts/10112345678901234";
const FB_VIDEO = "https://www.facebook.com/zuck/videos/1234567890";
const fbFrame = ({ kind, href }: { kind: "post" | "video"; href: string }) =>
  `https://www.facebook.com/plugins/${kind}.php?href=${encodeURIComponent(href)}`;
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

  it("embedQuotes swaps an Instagram blockquote for a sandboxed frame", () => {
    const html = embedQuotes({
      html:
        `<blockquote class="instagram-media" data-instgrm-permalink="${IG_POST.replace("&", "&amp;")}">` +
        '<p><a href="https://www.instagram.com/p/other/">A post shared by Ada</a></p></blockquote>',
    });
    const doc = new DOMParser().parseFromString(html, "text/html");

    expect(doc.querySelector("blockquote")).toBeNull();
    const frame = doc.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(IG_FRAME);
    expect(frame?.getAttribute("data-embed")).toBe("instagram");
    expect(frame?.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox",
    );
  });

  it("embedQuotes falls back to the last Instagram link when the permalink attribute is unusable", () => {
    const html = embedQuotes({
      html:
        '<blockquote class="instagram-media" data-instgrm-permalink="https://evil.test/p/x/">' +
        '<a href="https://www.instagram.com/ada/reel/Abc_1-2/">Reel</a><a href="https://example.test/">x</a></blockquote>',
    });
    const doc = new DOMParser().parseFromString(html, "text/html");

    expect(doc.querySelector("iframe")?.getAttribute("src")).toBe(
      "https://www.instagram.com/reel/Abc_1-2/embed/",
    );
  });

  it("embedQuotes keeps an Instagram blockquote with no post link", () => {
    for (const href of [
      "https://www.instagram.com/ada/",
      "https://www.instagram.com/p/a/b/",
      "https://instagram.com.evil.test/p/C0b8bKxLw5Q/",
      "javascript:alert(1)",
    ]) {
      const html = `<blockquote class="instagram-media" data-instgrm-permalink="${href}"><a href="${href}">x</a></blockquote>`;
      expect(embedQuotes({ html })).toBe(html);
    }
  });

  it("embedQuotes swaps a Threads blockquote for a frame on its permalink attribute", () => {
    const html = embedQuotes({
      html: `<blockquote class="text-post-media" data-text-post-permalink="${THREADS_POST}"><a href="https://www.threads.com/@other/post/x">Other</a></blockquote>`,
    });
    const frame = new DOMParser().parseFromString(html, "text/html").querySelector("iframe");

    expect(frame?.getAttribute("data-embed")).toBe("threads");
    expect(frame?.getAttribute("src")).toBe(`${THREADS_POST}/embed`);
  });

  it("embedQuotes falls back to the last Threads link, and keeps a blockquote with none", () => {
    const html = embedQuotes({
      html: `<blockquote class="text-post-media"><a href="https://www.threads.net/@zuck/post/C8x_1/">x</a></blockquote>`,
    });
    expect(
      new DOMParser()
        .parseFromString(html, "text/html")
        .querySelector("iframe")
        ?.getAttribute("src"),
    ).toBe("https://www.threads.com/@zuck/post/C8x_1/embed");

    for (const href of [
      "https://www.threads.com/@zuck",
      "https://threads.com.evil.test/@zuck/post/C8x/",
      "javascript:alert(1)",
    ]) {
      const kept = `<blockquote class="text-post-media" data-text-post-permalink="${href}"><a href="${href}">x</a></blockquote>`;
      expect(embedQuotes({ html: kept })).toBe(kept);
    }
  });

  it("embedQuotes swaps a TikTok blockquote for a frame on its cite URL", () => {
    const html = embedQuotes({
      html: `<blockquote class="tiktok-embed" cite="${TIKTOK_POST}" data-video-id="6718335390845095173"><section><a href="https://www.tiktok.com/@scout2015?refer=embed">@scout2015</a></section></blockquote>`,
    });
    const frame = new DOMParser().parseFromString(html, "text/html").querySelector("iframe");

    expect(frame?.getAttribute("data-embed")).toBe("tiktok");
    expect(frame?.getAttribute("src")).toBe("https://www.tiktok.com/embed/v2/6718335390845095173");
  });

  it("embedQuotes keeps a TikTok blockquote whose cite is not a video URL", () => {
    for (const cite of [
      "https://www.tiktok.com/@scout2015",
      "https://www.tiktok.com.evil.test/@a/video/1",
      "javascript:alert(1)",
    ]) {
      const html = `<blockquote class="tiktok-embed" cite="${cite}"><a href="${cite}">x</a></blockquote>`;
      expect(embedQuotes({ html })).toBe(html);
    }
  });

  it("embedQuotes swaps div.fb-post and div.fb-video for Facebook frames on data-href", () => {
    const html = embedQuotes({
      html: `<div class="fb-post" data-href="${FB_POST}?ref=x"></div><div class="fb-video" data-href="https://m.facebook.com/watch/?v=42&amp;t=3"></div>`,
    });
    const frames = [
      ...new DOMParser().parseFromString(html, "text/html").querySelectorAll("iframe"),
    ];

    expect(frames.map((frame) => frame.getAttribute("data-embed"))).toEqual([
      "facebook",
      "facebook-video",
    ]);
    expect(frames[0]?.getAttribute("src")).toBe(fbFrame({ kind: "post", href: FB_POST }));
    expect(frames[1]?.getAttribute("src")).toBe(
      fbFrame({ kind: "video", href: "https://www.facebook.com/watch/?v=42" }),
    );
  });

  it("embedQuotes accepts the permalink.php, videos and reel forms", () => {
    const cases = [
      {
        cls: "fb-post",
        href: "https://www.facebook.com/permalink.php?story_fbid=12&id=34&x=1",
        want: fbFrame({
          kind: "post",
          href: "https://www.facebook.com/permalink.php?story_fbid=12&id=34",
        }),
      },
      {
        cls: "fb-video",
        href: "https://facebook.com/reel/987654/",
        want: fbFrame({ kind: "video", href: "https://www.facebook.com/reel/987654/" }),
      },
      { cls: "fb-video", href: FB_VIDEO, want: fbFrame({ kind: "video", href: FB_VIDEO }) },
    ];
    for (const { cls, href, want } of cases) {
      const html = embedQuotes({
        html: `<div class="${cls}" data-href="${href.replace("&", "&amp;")}"></div>`,
      });
      expect(
        new DOMParser()
          .parseFromString(html, "text/html")
          .querySelector("iframe")
          ?.getAttribute("src"),
      ).toBe(want);
    }
  });

  it("embedQuotes keeps a Facebook div whose data-href is not a post or video of the right kind", () => {
    for (const { cls, href } of [
      { cls: "fb-post", href: "https://www.facebook.com/zuck" },
      { cls: "fb-post", href: "https://fb.watch/abc/" },
      { cls: "fb-post", href: "https://facebook.com.evil.test/zuck/posts/1" },
      { cls: "fb-post", href: "https://www.facebook.com/permalink.php?story_fbid=a&id=1" },
      { cls: "fb-post", href: FB_VIDEO },
      { cls: "fb-video", href: FB_POST },
      { cls: "fb-video", href: "https://www.facebook.com/watch/?v=abc" },
      { cls: "fb-video", href: "javascript:alert(1)" },
    ]) {
      const html = `<div class="${cls}" data-href="${href}"></div>`;
      expect(embedQuotes({ html })).toBe(html);
    }
  });

  it("iframeEmbed re-validates a Facebook plugin frame by its inner href", () => {
    expect(iframeEmbed({ src: `${fbFrame({ kind: "post", href: FB_POST })}&width=500` })).toEqual({
      name: "facebook",
      src: fbFrame({ kind: "post", href: FB_POST }),
    });
    expect(iframeEmbed({ src: fbFrame({ kind: "video", href: FB_VIDEO }) })?.name).toBe(
      "facebook-video",
    );
    for (const src of [
      fbFrame({ kind: "post", href: "https://evil.test/zuck/posts/1" }),
      fbFrame({ kind: "post", href: FB_VIDEO }),
      "https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2Fzuck",
      "https://www.facebook.com/plugins/post.php",
      "https://evil.test/plugins/post.php?href=" + encodeURIComponent(FB_POST),
    ]) {
      expect(iframeEmbed({ src })).toBeNull();
    }
  });

  it("xResizeHeight reads X's resize message from its origin only, clamped", () => {
    const origin = "https://platform.twitter.com";
    const message = (height: unknown) => ({
      "twttr.embed": { method: "twttr.private.resize", params: [{ width: 535, height }] },
    });
    expect(xResizeHeight({ origin, data: message(688) })).toBe(688);
    expect(xResizeHeight({ origin, data: JSON.stringify(message(10.5)) })).toBe(120);
    expect(xResizeHeight({ origin, data: message(1e6) })).toBe(4000);
    expect(xResizeHeight({ origin: "https://evil.test", data: message(688) })).toBeNull();
    for (const data of [
      "{",
      null,
      3,
      message("688"),
      message(NaN),
      { "twttr.embed": { method: "x" } },
    ]) {
      expect(xResizeHeight({ origin, data })).toBeNull();
    }
  });
});
