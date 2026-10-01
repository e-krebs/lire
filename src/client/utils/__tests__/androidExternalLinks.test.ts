import { afterEach, describe, expect, it, vi } from "vitest";
import { androidIntentUrl, installAndroidExternalLinks } from "../androidExternalLinks";

const click = (target: Element): MouseEvent => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe("androidExternalLinks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("wraps an external link in a view intent with the page as fallback", () => {
    expect(androidIntentUrl("https://example.com/a/b?x=1#top")).toBe(
      `intent://example.com/a/b?x=1#top#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent("https://example.com/a/b?x=1#top")};end`,
    );
  });

  it("leaves same-origin, non-http and invalid links alone", () => {
    expect(androidIntentUrl(`${window.location.origin}/stream/all`)).toBeUndefined();
    expect(androidIntentUrl("mailto:someone@example.com")).toBeUndefined();
    expect(androidIntentUrl("not a url")).toBeUndefined();
  });

  it("hands an external click to the system only in an installed Android app", () => {
    const link = document.createElement("a");
    link.href = "https://example.com/post";
    document.body.append(link);

    installAndroidExternalLinks();
    expect(click(link).defaultPrevented).toBe(false);

    const assign = vi.fn<(url: string) => void>();
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130" });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal("location", { origin: window.location.origin, assign });
    installAndroidExternalLinks();

    expect(click(link).defaultPrevented).toBe(true);
    expect(assign).toHaveBeenCalledWith(androidIntentUrl("https://example.com/post"));
  });
});
