// An installed Android PWA opens a link to another site in an in-app Custom Tab. An intent: URL
// hands it to the system instead, which opens the default browser. S.browser_fallback_url keeps the
// link working in place if no app takes the intent.

const isAndroidApp = (): boolean =>
  /android/i.test(navigator.userAgent) && window.matchMedia("(display-mode: standalone)").matches;

const androidIntentUrl = (href: string): string | undefined => {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (url.origin === window.location.origin) return undefined;
  const scheme = url.protocol.slice(0, -1);
  const rest = `${url.host}${url.pathname}${url.search}${url.hash}`;
  return `intent://${rest}#Intent;scheme=${scheme};action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
};

// One listener for every link, including the ones inside sanitized article HTML. It runs after the
// components' own handlers, so a click they already handled is left alone.
export const installAndroidExternalLinks = (): void => {
  if (!isAndroidApp()) return;
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a");
    if (link === null) return;
    const intent = androidIntentUrl(link.href);
    if (intent === undefined) return;
    event.preventDefault();
    window.location.assign(intent);
  });
};
