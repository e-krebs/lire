import { afterEach, describe, expect, it, vi } from "vitest";
import { isAndroidBrowser } from "../androidApp";

const ANDROID = "Mozilla/5.0 (Linux; Android 14) Chrome/130";
const DESKTOP = "Mozilla/5.0 (Macintosh) Safari/605";

const setUserAgent = (userAgent: string): void => {
  vi.stubGlobal("navigator", { userAgent });
};

describe("isAndroidBrowser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("is true for an Android browser outside the TWA", () => {
    setUserAgent(ANDROID);
    expect(isAndroidBrowser()).toBe(true);
  });

  it("is false on desktop", () => {
    setUserAgent(DESKTOP);
    expect(isAndroidBrowser()).toBe(false);
  });

  it("is false without a navigator", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isAndroidBrowser()).toBe(false);
  });

  it("is false on the TWA launch URL", () => {
    setUserAgent(ANDROID);
    window.history.replaceState({}, "", "/?source=twa");
    expect(isAndroidBrowser()).toBe(false);
  });

  it("is false once the TWA session key is stored", () => {
    setUserAgent(ANDROID);
    window.sessionStorage.setItem("lire.twa", "true");
    expect(isAndroidBrowser()).toBe(false);
  });
});
