import { afterEach, describe, expect, it, vi } from "vitest";
import { installAndroidExternalLinks } from "../androidExternalLinks";

const click = (target: Element): MouseEvent => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

const linkTo = (href: string): HTMLAnchorElement => {
  const link = document.createElement("a");
  link.href = href;
  document.body.append(link);
  return link;
};

describe("installAndroidExternalLinks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("hands an external click to the system as a view intent, only in an installed Android app", () => {
    const link = linkTo("https://example.com/a/b?x=1#top");

    installAndroidExternalLinks();
    expect(click(link).defaultPrevented).toBe(false);

    const assign = vi.fn<(url: string) => void>();
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130" });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal("location", { origin: window.location.origin, assign });
    installAndroidExternalLinks();

    expect(click(link).defaultPrevented).toBe(true);
    expect(assign).toHaveBeenCalledWith(
      `intent://example.com/a/b?x=1#top#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent("https://example.com/a/b?x=1#top")};end`,
    );
  });

  it("leaves same-origin and non-http links alone", () => {
    const assign = vi.fn<(url: string) => void>();
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130" });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal("location", { origin: window.location.origin, assign });
    installAndroidExternalLinks();

    expect(click(linkTo(`${window.location.origin}/stream/all`)).defaultPrevented).toBe(false);
    expect(click(linkTo("mailto:someone@example.com")).defaultPrevented).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});
