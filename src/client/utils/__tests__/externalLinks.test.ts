import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  browserChoices,
  getPreferredBrowser,
  installExternalLinks,
  openExternal,
  setPreferredBrowser,
} from "../externalLinks";

const IPAD = {
  userAgent: "Mozilla/5.0 (Macintosh) Safari/605",
  platform: "MacIntel",
  maxTouchPoints: 5,
};
const IPHONE = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605",
  maxTouchPoints: 5,
};
const ANDROID = { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130", maxTouchPoints: 5 };
const MAC = {
  userAgent: "Mozilla/5.0 (Macintosh) Safari/605",
  platform: "MacIntel",
  maxTouchPoints: 0,
};

const click = (target: Element, init: MouseEventInit = {}): MouseEvent => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

const linkTo = (href: string, attribute?: string): HTMLAnchorElement => {
  const link = document.createElement("a");
  link.href = href;
  if (attribute !== undefined) link.setAttribute(attribute, "");
  document.body.append(link);
  return link;
};

const assign = vi.fn<(url: string) => void>();

const stubPlatform = ({
  device,
  installed,
  search = "",
}: {
  device: object;
  installed: boolean;
  search?: string;
}): void => {
  vi.stubGlobal("navigator", device);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: installed && query === "(display-mode: standalone)",
  }));
  vi.stubGlobal("location", {
    origin: window.location.origin,
    href: window.location.href,
    search,
    assign,
  });
  // jsdom never reports focus.
  stubDocument({ hasFocus: () => true });
};

// Own properties shadow the Document.prototype ones, and afterEach deletes them.
const stubDocument = (props: { hasFocus?: () => boolean; referrer?: string }): void => {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(document, key, { configurable: true, value });
  }
};

describe("externalLinks", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  // Elements are appended straight to document.body, which the global cleanup does not unmount.
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    Reflect.deleteProperty(document, "hasFocus");
    Reflect.deleteProperty(document, "referrer");
    assign.mockReset();
    document.body.innerHTML = "";
  });

  it("offers browsers only in an installed iOS app, iPad included", () => {
    stubPlatform({ device: IPAD, installed: false });
    expect(browserChoices()).toEqual([]);

    stubPlatform({ device: IPAD, installed: true });
    expect(browserChoices().map(({ label }) => label)).toEqual(["Safari", "Chrome"]);

    stubPlatform({ device: IPHONE, installed: false });
    vi.stubGlobal("navigator", { ...IPHONE, standalone: true });
    expect(browserChoices()).toHaveLength(2);

    stubPlatform({ device: ANDROID, installed: true });
    expect(browserChoices()).toEqual([]);
    stubPlatform({ device: MAC, installed: true });
    expect(browserChoices()).toEqual([]);
  });

  it("defaults to Safari, remembers a choice and ignores an unknown one", () => {
    stubPlatform({ device: IPAD, installed: true });
    expect(getPreferredBrowser()).toBe("safari");
    setPreferredBrowser("chrome");
    expect(getPreferredBrowser()).toBe("chrome");
    setPreferredBrowser("none");
    expect(getPreferredBrowser()).toBe("none");
    window.localStorage.setItem("lire.externalBrowser", "firefox");
    expect(getPreferredBrowser()).toBe("safari");

    stubPlatform({ device: ANDROID, installed: true });
    expect(getPreferredBrowser()).toBeUndefined();
  });

  it("falls back to the default when storage throws", () => {
    stubPlatform({ device: IPAD, installed: true });
    const blocked = (): never => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
    expect(() => {
      setPreferredBrowser("chrome");
    }).not.toThrow();
    expect(getPreferredBrowser()).toBe("safari");
  });

  it("uses the browser schemes and opens in place if the page never left", () => {
    vi.useFakeTimers();
    stubPlatform({ device: IPAD, installed: true });

    expect(openExternal({ url: "https://example.com/a", browser: "safari" })).toBe(true);
    expect(assign).toHaveBeenLastCalledWith("x-safari-https://example.com/a");
    vi.advanceTimersByTime(2000);
    expect(assign).toHaveBeenLastCalledWith("https://example.com/a");

    openExternal({ url: "https://example.com/a", browser: "chrome" });
    expect(assign).toHaveBeenLastCalledWith("googlechromes://example.com/a");
    expect(openExternal({ url: "https://example.com/b", browser: "chrome" })).toBe(true);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(2000);
    expect(assign).toHaveBeenCalledTimes(3);

    openExternal({ url: "https://example.com/a", browser: "chrome" });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(2000);
    expect(assign).toHaveBeenCalledTimes(4);

    // Split View: the app stays visible but loses focus to the browser beside it.
    openExternal({ url: "https://example.com/a", browser: "safari" });
    stubDocument({ hasFocus: () => false });
    vi.advanceTimersByTime(2000);
    expect(assign).toHaveBeenCalledTimes(5);

    expect(openExternal({ url: "https://example.com/a", browser: "none" })).toBe(false);
    stubPlatform({ device: ANDROID, installed: true });
    expect(openExternal({ url: "https://example.com/a", browser: "chrome" })).toBe(false);
  });

  it("hands links to the Android app's activity only inside the TWA", () => {
    stubPlatform({ device: ANDROID, installed: true });
    stubDocument({ referrer: "android-app://tech.krebs.lire/" });
    expect(browserChoices().map(({ id }) => id)).toEqual([
      "default",
      "chrome",
      "firefox",
      "samsung",
      "edge",
      "brave",
    ]);
    expect(getPreferredBrowser()).toBe("default");

    // Later pages of the session lose the referrer.
    stubDocument({ referrer: "" });
    const url = "https://example.com/a?x=1&y=2";
    expect(openExternal({ url, browser: "firefox" })).toBe(true);
    expect(assign).toHaveBeenLastCalledWith(
      `intent://open?url=${encodeURIComponent(url)}&browser=org.mozilla.firefox` +
        "#Intent;scheme=lire-open;package=tech.krebs.lire;end",
    );
    // No fallback timer, so a second tap goes through.
    openExternal({ url, browser: "default" });
    expect(assign).toHaveBeenLastCalledWith(
      `intent://open?url=${encodeURIComponent(url)}#Intent;scheme=lire-open;package=tech.krebs.lire;end`,
    );
    expect(openExternal({ url, browser: "safari" })).toBe(false);

    // After an Access login the referrer is gone, but the launch URL keeps its marker.
    window.sessionStorage.clear();
    stubPlatform({ device: ANDROID, installed: true, search: "?source=twa" });
    expect(browserChoices()).toHaveLength(6);
  });

  it("reroutes plain clicks on external links and leaves every other click alone", () => {
    vi.useFakeTimers();
    stubPlatform({ device: IPAD, installed: true });
    installExternalLinks();
    const url = "https://example.com/a?x=1";

    const blank = linkTo(url);
    blank.target = "_blank";
    const child = document.createElement("span");
    blank.append(child);
    expect(click(child).defaultPrevented).toBe(true);
    expect(assign).toHaveBeenCalledWith(`x-safari-${url}`);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(2000);
    assign.mockReset();

    const handled = linkTo(url);
    handled.addEventListener("click", (event) => {
      event.preventDefault();
    });
    click(handled);
    expect(click(linkTo(url), { button: 1 }).defaultPrevented).toBe(false);

    expect(click(linkTo(url), { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(click(linkTo(url, "data-open-in-app")).defaultPrevented).toBe(false);
    expect(click(linkTo(url, "download")).defaultPrevented).toBe(false);
    expect(click(linkTo(`${window.location.origin}/stream/all`)).defaultPrevented).toBe(false);
    expect(click(linkTo("mailto:someone@example.com")).defaultPrevented).toBe(false);
    expect(click(linkTo("https://team.cloudflareaccess.com/")).defaultPrevented).toBe(false);
    expect(assign).not.toHaveBeenCalled();

    setPreferredBrowser("none");
    expect(click(linkTo(url)).defaultPrevented).toBe(false);
  });
});
