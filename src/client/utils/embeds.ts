const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"]);
const X_HOSTS = new Set(["twitter.com", "www.twitter.com", "x.com", "www.x.com"]);
const VIMEO_HOST = "player.vimeo.com";
const YOUTUBE_PATH = /^\/embed\/([\w-]+)\/?$/;
const TWEET_PATH = /^\/\w+\/status\/(\d+)\/?$/;
const VIMEO_PATH = /^\/video\/(\d+)\/?$/;
const VIMEO_HASH = /^[0-9a-f]+$/;
const BLUESKY_URI =
  /^at:\/\/(did:[a-z]+:[A-Za-z0-9._:%-]+)\/app\.bsky\.feed\.post\/([A-Za-z0-9]+)$/;

export const EMBED_SANDBOX =
  "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

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

const FRAME_EMBEDS: { name: string; frameUrl: (args: { src: string }) => string | null }[] = [
  { name: "youtube", frameUrl: youtubeEmbedUrl },
  { name: "vimeo", frameUrl: vimeoEmbedUrl },
];

const QUOTE_EMBEDS: {
  name: string;
  selector: string;
  href: (args: { quote: Element }) => string | null;
  frameUrl: (args: { href: string }) => string | null;
}[] = [
  {
    name: "x",
    selector: "blockquote.twitter-tweet",
    // X's own markup ends on the date link to the post; earlier links can point at other posts.
    href: ({ quote }) =>
      [...quote.querySelectorAll("a[href]")]
        .reverse()
        .map((link) => link.getAttribute("href") ?? "")
        .find((href) => tweetEmbedUrl({ href }) !== null) ?? null,
    frameUrl: tweetEmbedUrl,
  },
  {
    name: "bluesky",
    selector: "blockquote.bluesky-embed",
    href: ({ quote }) => quote.getAttribute("data-bluesky-uri"),
    frameUrl: blueskyEmbedUrl,
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
  frame.setAttribute("loading", "lazy");
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  return frame;
};

// Runs on already-sanitized markup: the frame is built here from a checked id, so a feed's own
// platform.twitter.com frame never gets past the sanitizer. Parsed into its own inert document.
export const embedQuotes = ({ html }: { html: string }): string => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  for (const { name, selector, href, frameUrl } of QUOTE_EMBEDS) {
    for (const quote of doc.querySelectorAll(selector)) {
      const permalink = href({ quote });
      const src = permalink === null ? null : frameUrl({ href: permalink });
      if (src === null) continue;
      const title = quote.textContent.trim().slice(0, 140) || name.toUpperCase();
      quote.replaceWith(buildFrame({ doc, name, src, title }));
      changed = true;
    }
  }
  return changed ? doc.body.innerHTML : html;
};
