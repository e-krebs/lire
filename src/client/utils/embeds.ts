const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"]);
const X_HOSTS = new Set(["twitter.com", "www.twitter.com", "x.com", "www.x.com"]);
const YOUTUBE_PATH = /^\/embed\/([\w-]+)\/?$/;
const TWEET_PATH = /^\/\w+\/status\/(\d+)\/?$/;

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

export const youtubeEmbedUrl = ({ src }: { src: string }): string | null => {
  const url = parse(src);
  if (url === null || !YOUTUBE_HOSTS.has(url.hostname)) return null;
  const id = YOUTUBE_PATH.exec(url.pathname)?.[1];
  return id === undefined ? null : `https://www.youtube.com/embed/${id}`;
};

const tweetEmbedUrl = ({ href }: { href: string }): string | null => {
  const url = parse(href);
  if (url === null || !X_HOSTS.has(url.hostname)) return null;
  const id = TWEET_PATH.exec(url.pathname)?.[1];
  return id === undefined
    ? null
    : `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`;
};

// Runs on already-sanitized markup: the frame is built here from a checked id, so a feed's own
// platform.twitter.com frame never gets past the sanitizer. Parsed into its own inert document.
export const embedTweets = ({ html }: { html: string }): string => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const quotes = doc.querySelectorAll("blockquote.twitter-tweet");
  if (quotes.length === 0) return html;
  for (const quote of quotes) {
    // X's own markup ends on the date link to the post; earlier links can point at other posts.
    const src = [...quote.querySelectorAll("a[href]")]
      .reverse()
      .map((link) => tweetEmbedUrl({ href: link.getAttribute("href") ?? "" }))
      .find((url) => url !== null);
    if (src === undefined) continue;
    const frame = doc.createElement("iframe");
    frame.setAttribute("src", src);
    frame.setAttribute("data-embed", "x");
    frame.setAttribute("title", quote.textContent.trim().slice(0, 140) || "X");
    frame.setAttribute("sandbox", EMBED_SANDBOX);
    frame.setAttribute("loading", "lazy");
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    quote.replaceWith(frame);
  }
  return doc.body.innerHTML;
};
