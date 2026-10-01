// An installed PWA opens a link to another site in an in-app view: a Safari view on iOS, a Custom
// Tab on Android. This hands it to a browser the user picked once instead. iOS gets there through
// the browser's own URL scheme. On Android, Chrome turns every intent back to Chrome into a Custom
// Tab, so only the Trusted Web Activity in android/ can do it: the page sends an intent to that
// app, whose OpenInBrowserActivity opens the link in the named browser.

const STORAGE_KEY = "lire.externalBrowser";
const TWA_SESSION_KEY = "lire.twa";
const TWA_PACKAGE = "tech.krebs.lire";

// "none" is "This app": the link opens in place, as it would without this module.
export type BrowserId =
  | "safari"
  | "chrome"
  | "default"
  | "firefox"
  | "samsung"
  | "edge"
  | "brave"
  | "none";

type Browser = { id: BrowserId; label: string; open: (url: URL) => string };

const IOS_BROWSERS: Browser[] = [
  // x-safari-https:// needs iOS / iPadOS 17.
  { id: "safari", label: "Safari", open: (url) => `x-safari-${url.href}` },
  { id: "chrome", label: "Chrome", open: (url) => url.href.replace(/^http/, "googlechrome") },
];

// Without a package, or when that browser is missing, the app falls back to the default browser.
const twaIntent =
  (browser?: string) =>
  (url: URL): string =>
    `intent://open?url=${encodeURIComponent(url.href)}${browser === undefined ? "" : `&browser=${browser}`}` +
    `#Intent;scheme=lire-open;package=${TWA_PACKAGE};end`;

const TWA_BROWSERS: Browser[] = [
  { id: "default", label: "Default browser", open: twaIntent() },
  { id: "chrome", label: "Chrome", open: twaIntent("com.android.chrome") },
  { id: "firefox", label: "Firefox", open: twaIntent("org.mozilla.firefox") },
  { id: "samsung", label: "Samsung Internet", open: twaIntent("com.sec.android.app.sbrowser") },
  { id: "edge", label: "Edge", open: twaIntent("com.microsoft.emmx") },
  { id: "brave", label: "Brave", open: twaIntent("com.brave.browser") },
];

// The Access login must come back to the app. The upstream OAuth needs no entry: it starts
// same-origin at /api/auth/login and redirects server side, and its name must stay out of the
// bundle for the demo brand gate.
const IN_APP_HOSTS = ["cloudflareaccess.com"];

// iPadOS reports itself as a Mac, so touch support tells them apart.
const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Only the launch page knows it runs in the TWA, so the session keeps it. The launch URL carries
// ?source=twa, which survives an Access login. The referrer does not, so it is only a second sign.
const isTWALaunch = (): boolean =>
  new URLSearchParams(window.location.search).get("source") === "twa" ||
  document.referrer.startsWith(`android-app://${TWA_PACKAGE}`);

const isTWA = (): boolean => {
  try {
    if (isTWALaunch()) {
      window.sessionStorage.setItem(TWA_SESSION_KEY, "true");
      return true;
    }
    return window.sessionStorage.getItem(TWA_SESSION_KEY) === "true";
  } catch {
    return isTWALaunch();
  }
};

// navigator.standalone is iOS only, and missing from the DOM types.
const isInstalled = (): boolean =>
  ["standalone", "fullscreen", "minimal-ui"].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  ) ||
  ("standalone" in navigator && navigator.standalone === true);

type Platform = { browsers: Browser[]; defaultBrowser: BrowserId; fallsBack: boolean };

// iOS fails an unknown scheme silently, so it needs the fallback below. The TWA's own activity
// handles a missing browser itself.
const IOS: Platform = { browsers: IOS_BROWSERS, defaultBrowser: "safari", fallsBack: true };
const TWA: Platform = { browsers: TWA_BROWSERS, defaultBrowser: "default", fallsBack: false };

const currentPlatform = (): Platform | undefined => {
  if (isIOS()) return IOS;
  if (isTWA()) return TWA;
  return undefined;
};

// A TWA is always installed. iOS needs the home-screen app.
const installedPlatform = (): Platform | undefined => {
  const platform = currentPlatform();
  if (platform === IOS && !isInstalled()) return undefined;
  return platform;
};

// Empty outside an installed iOS app or the TWA, which is when the setting hides.
export const browserChoices = (): { id: BrowserId; label: string }[] =>
  installedPlatform()?.browsers.map(({ id, label }) => ({ id, label })) ?? [];

export const getPreferredBrowser = (): BrowserId | undefined => {
  const platform = currentPlatform();
  if (platform === undefined) return undefined;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "none") return "none";
    const browser = platform.browsers.find(({ id }) => id === stored);
    if (browser !== undefined) return browser.id;
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return platform.defaultBrowser;
};

export const setPreferredBrowser = (id: BrowserId): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // A private window or a full quota: the default stays in effect.
  }
};

// iOS fails an unknown scheme silently, so if the page still has focus after a while, the link
// opens in place after all. Focus, not just visibility: in Split View the app stays visible beside
// the browser it handed off to. While one handoff is pending, further taps are dropped.
let pending = false;

const fallBackIfStillVisible = (url: URL): void => {
  pending = true;
  let left = false;
  const markLeft = (): void => {
    left = true;
  };
  window.addEventListener("blur", markLeft, { once: true });
  window.addEventListener("pagehide", markLeft, { once: true });
  document.addEventListener("visibilitychange", markLeft, { once: true });
  window.setTimeout(() => {
    pending = false;
    window.removeEventListener("blur", markLeft);
    window.removeEventListener("pagehide", markLeft);
    document.removeEventListener("visibilitychange", markLeft);
    if (!left && document.visibilityState === "visible" && document.hasFocus()) {
      window.location.assign(url.href);
    }
  }, 2000);
};

// Runs synchronously in the click handler, so the scheme navigation keeps the user gesture. False
// means the caller lets the link proceed as usual.
export const openExternal = ({
  url,
  browser = getPreferredBrowser(),
}: {
  url: string;
  browser?: BrowserId;
}): boolean => {
  const platform = currentPlatform();
  if (platform === undefined) return false;
  if (pending) return true;
  const target = platform.browsers.find(({ id }) => id === browser);
  if (target === undefined) return false;
  const parsed = new URL(url);
  if (platform.fallsBack) fallBackIfStillVisible(parsed);
  window.location.assign(target.open(parsed));
  return true;
};

// The manifest scope is "/", so leaving the origin is leaving the app.
const isExternal = (url: URL): boolean =>
  /^https?:$/.test(url.protocol) &&
  url.origin !== window.location.origin &&
  !IN_APP_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));

// One listener for every link, including the ones inside sanitized article HTML. It runs after the
// components' own handlers, so a click they already handled is left alone. A link opts out with
// data-open-in-app. SVG links are left alone too.
export const installExternalLinks = (): void => {
  if (installedPlatform() === undefined) return;
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    if (link.hasAttribute("download") || link.hasAttribute("data-open-in-app")) return;
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      return;
    }
    if (!isExternal(url)) return;
    if (openExternal({ url: url.href })) event.preventDefault();
  });
};
