const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"]);
const X_HOSTS = new Set(["twitter.com", "www.twitter.com", "x.com", "www.x.com"]);
const VIMEO_HOST = "player.vimeo.com";
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const THREADS_HOSTS = new Set(["threads.com", "www.threads.com", "threads.net", "www.threads.net"]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com"]);
const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com"]);
const YOUTUBE_PATH = /^\/embed\/([\w-]+)\/?$/;
const TWEET_PATH = /^\/\w+\/status\/(\d+)\/?$/;
const VIMEO_PATH = /^\/video\/(\d+)\/?$/;
const VIMEO_HASH = /^[0-9a-f]+$/;
const INSTAGRAM_PATH = /^\/(?:[\w.]+\/)?(p|reel)\/([\w-]+)\/?$/;
const THREADS_PATH = /^\/(@[\w.]+)\/post\/([\w-]+)\/?$/;
const TIKTOK_PATH = /^\/@[\w.-]+\/video\/(\d+)\/?$/;
const FACEBOOK_POST_PATH = /^\/[\w.-]+\/posts\/[\w-]+\/?$/;
const FACEBOOK_VIDEO_PATH = /^\/(?:[\w.-]+\/videos\/|reel\/)\d+\/?$/;
const FACEBOOK_PLUGIN_PATH = /^\/plugins\/(post|video)\.php$/;
const DIGITS = /^\d+$/;
const BLUESKY_URI =
  /^at:\/\/(did:[a-z]+:[A-Za-z0-9._:%-]+)\/app\.bsky\.feed\.post\/([A-Za-z0-9]+)$/;

export const EMBED_SANDBOX =
  "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

export const EMBED_ALLOW = "encrypted-media; picture-in-picture; fullscreen";

// The base resolves protocol-relative `//www.youtube.com/...` sources to https.
const parse = (url: string): URL | null => {
  try {
    const parsed = new URL(url, "https://x");
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
};

const youtubeEmbedUrl = ({ src }: { src: string }): string | null => {
  const url = parse(src);
  if (url === null || !YOUTUBE_HOSTS.has(url.hostname)) return null;
  const id = YOUTUBE_PATH.exec(url.pathname)?.[1];
  return id === undefined ? null : `https://www.youtube.com/embed/${id}`;
};

const vimeoEmbedUrl = ({ src }: { src: string }): string | null => {
  const url = parse(src);
  if (url === null || url.hostname !== VIMEO_HOST) return null;
  const id = VIMEO_PATH.exec(url.pathname)?.[1];
  if (id === undefined) return null;
  const params = new URLSearchParams();
  const hash = url.searchParams.get("h");
  // An unlisted video only plays with its `h` token.
  if (hash !== null && VIMEO_HASH.test(hash)) params.set("h", hash);
  params.set("dnt", "1");
  return `https://${VIMEO_HOST}/video/${id}?${params}`;
};

const blueskyEmbedUrl = ({ href }: { href: string }): string | null => {
  const match = BLUESKY_URI.exec(href);
  return match === null
    ? null
    : `https://embed.bsky.app/embed/${match[1]}/app.bsky.feed.post/${match[2]}`;
};

const tweetEmbedUrl = ({ href }: { href: string }): string | null => {
  const url = parse(href);
  if (url === null || !X_HOSTS.has(url.hostname)) return null;
  const id = TWEET_PATH.exec(url.pathname)?.[1];
  return id === undefined
    ? null
    : `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`;
};

const instagramEmbedUrl = ({ href }: { href: string }): string | null => {
  const url = parse(href);
  if (url === null || !INSTAGRAM_HOSTS.has(url.hostname)) return null;
  const match = INSTAGRAM_PATH.exec(url.pathname);
  return match === null ? null : `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
};

const threadsEmbedUrl = ({ href }: { href: string }): string | null => {
  const url = parse(href);
  if (url === null || !THREADS_HOSTS.has(url.hostname)) return null;
  const match = THREADS_PATH.exec(url.pathname);
  return match === null ? null : `https://www.threads.com/${match[1]}/post/${match[2]}/embed`;
};

const tiktokEmbedUrl = ({ href }: { href: string }): string | null => {
  const url = parse(href);
  if (url === null || !TIKTOK_HOSTS.has(url.hostname)) return null;
  const id = TIKTOK_PATH.exec(url.pathname)?.[1];
  return id === undefined ? null : `https://www.tiktok.com/embed/v2/${id}`;
};

// Rebuilds a public Facebook URL from its checked parts, so the plugin `href` carries no tracking.
const facebookPermalink = ({
  href,
  kind,
}: {
  href: string;
  kind: "post" | "video";
}): string | null => {
  const url = parse(href);
  if (url === null || !FACEBOOK_HOSTS.has(url.hostname)) return null;
  const { pathname, searchParams } = url;
  if (kind === "post") {
    if (FACEBOOK_POST_PATH.test(pathname)) return `https://www.facebook.com${pathname}`;
    const story = searchParams.get("story_fbid");
    const id = searchParams.get("id");
    if (pathname !== "/permalink.php" || story === null || id === null) return null;
    if (!DIGITS.test(story) || !DIGITS.test(id)) return null;
    return `https://www.facebook.com/permalink.php?story_fbid=${story}&id=${id}`;
  }
  if (FACEBOOK_VIDEO_PATH.test(pathname)) return `https://www.facebook.com${pathname}`;
  const v = searchParams.get("v");
  if (!/^\/watch\/?$/.test(pathname) || v === null || !DIGITS.test(v)) return null;
  return `https://www.facebook.com/watch/?v=${v}`;
};

const facebookFrameUrl = ({
  href,
  kind,
}: {
  href: string;
  kind: "post" | "video";
}): string | null => {
  const permalink = facebookPermalink({ href, kind });
  return permalink === null
    ? null
    : `https://www.facebook.com/plugins/${kind}.php?href=${encodeURIComponent(permalink)}`;
};

const facebookPluginUrl =
  ({ kind }: { kind: "post" | "video" }) =>
  ({ src }: { src: string }): string | null => {
    const url = parse(src);
    if (url === null || !FACEBOOK_HOSTS.has(url.hostname)) return null;
    if (FACEBOOK_PLUGIN_PATH.exec(url.pathname)?.[1] !== kind) return null;
    const href = url.searchParams.get("href");
    return href === null ? null : facebookFrameUrl({ href, kind });
  };

const facebookPostEmbedUrl = ({ href }: { href: string }) =>
  facebookFrameUrl({ href, kind: "post" });
const facebookVideoEmbedUrl = ({ href }: { href: string }) =>
  facebookFrameUrl({ href, kind: "video" });

const lastLink = ({
  quote,
  frameUrl,
}: {
  quote: Element;
  frameUrl: (args: { href: string }) => string | null;
}): string | null =>
  [...quote.querySelectorAll("a[href]")]
    .reverse()
    .map((link) => link.getAttribute("href") ?? "")
    .find((href) => frameUrl({ href }) !== null) ?? null;

const FRAME_EMBEDS: { name: string; frameUrl: (args: { src: string }) => string | null }[] = [
  { name: "youtube", frameUrl: youtubeEmbedUrl },
  { name: "vimeo", frameUrl: vimeoEmbedUrl },
  { name: "facebook", frameUrl: facebookPluginUrl({ kind: "post" }) },
  { name: "facebook-video", frameUrl: facebookPluginUrl({ kind: "video" }) },
];

const QUOTE_EMBEDS: {
  name: string;
  brand: string;
  selector: string;
  href: (args: { quote: Element }) => string | null;
  frameUrl: (args: { href: string }) => string | null;
}[] = [
  {
    name: "x",
    brand: "X",
    selector: "blockquote.twitter-tweet",
    // X's own markup ends on the date link to the post; earlier links can point at other posts.
    href: ({ quote }) => lastLink({ quote, frameUrl: tweetEmbedUrl }),
    frameUrl: tweetEmbedUrl,
  },
  {
    name: "bluesky",
    brand: "Bluesky",
    selector: "blockquote.bluesky-embed",
    href: ({ quote }) => quote.getAttribute("data-bluesky-uri"),
    frameUrl: blueskyEmbedUrl,
  },
  {
    name: "instagram",
    brand: "Instagram",
    selector: "blockquote.instagram-media",
    href: ({ quote }) => {
      const permalink = quote.getAttribute("data-instgrm-permalink");
      return permalink !== null && instagramEmbedUrl({ href: permalink }) !== null
        ? permalink
        : lastLink({ quote, frameUrl: instagramEmbedUrl });
    },
    frameUrl: instagramEmbedUrl,
  },
  {
    name: "threads",
    brand: "Threads",
    selector: "blockquote.text-post-media",
    href: ({ quote }) => {
      const permalink = quote.getAttribute("data-text-post-permalink");
      return permalink !== null && threadsEmbedUrl({ href: permalink }) !== null
        ? permalink
        : lastLink({ quote, frameUrl: threadsEmbedUrl });
    },
    frameUrl: threadsEmbedUrl,
  },
  {
    name: "tiktok",
    brand: "TikTok",
    selector: "blockquote.tiktok-embed",
    href: ({ quote }) => {
      const cite = quote.getAttribute("cite");
      return cite !== null && tiktokEmbedUrl({ href: cite }) !== null
        ? cite
        : lastLink({ quote, frameUrl: tiktokEmbedUrl });
    },
    frameUrl: tiktokEmbedUrl,
  },
  {
    name: "facebook",
    brand: "Facebook",
    selector: "div.fb-post",
    href: ({ quote }) => quote.getAttribute("data-href"),
    frameUrl: facebookPostEmbedUrl,
  },
  {
    name: "facebook-video",
    brand: "Facebook",
    selector: "div.fb-video",
    href: ({ quote }) => quote.getAttribute("data-href"),
    frameUrl: facebookVideoEmbedUrl,
  },
];

export const iframeEmbed = ({ src }: { src: string }): { name: string; src: string } | null => {
  for (const { name, frameUrl } of FRAME_EMBEDS) {
    const checked = frameUrl({ src });
    if (checked !== null) return { name, src: checked };
  }
  return null;
};

const buildFrame = ({
  doc,
  name,
  src,
  title,
}: {
  doc: Document;
  name: string;
  src: string;
  title: string;
}): HTMLIFrameElement => {
  const frame = doc.createElement("iframe");
  frame.setAttribute("src", src);
  frame.setAttribute("data-embed", name);
  frame.setAttribute("title", title);
  frame.setAttribute("sandbox", EMBED_SANDBOX);
  frame.setAttribute("allow", EMBED_ALLOW);
  frame.setAttribute("allowfullscreen", "");
  frame.setAttribute("loading", "lazy");
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  return frame;
};

// Runs on already-sanitized markup: the frame is built here from a checked id, so a feed's own
// platform.twitter.com frame never gets past the sanitizer. Parsed into its own inert document.
export const embedQuotes = ({ html }: { html: string }): string => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  for (const { name, brand, selector, href, frameUrl } of QUOTE_EMBEDS) {
    for (const quote of doc.querySelectorAll(selector)) {
      const permalink = href({ quote });
      const src = permalink === null ? null : frameUrl({ href: permalink });
      if (permalink === null || src === null) continue;
      const title = quote.textContent.trim().slice(0, 140) || brand;
      quote.replaceWith(buildFrame({ doc, name, src, title }));
      changed = true;
    }
  }
  return changed ? doc.body.innerHTML : html;
};
