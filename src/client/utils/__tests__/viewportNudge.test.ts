import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installViewportNudge } from "client/utils/viewportNudge";

const CONTENT = "width=device-width, initial-scale=1, interactive-widget=resizes-content";
const FLIPPED = "width=device-width, initial-scale=1, interactive-widget=resizes-visual";

let meta: HTMLMetaElement;
let uninstall: () => void = () => {};

const setVisibility = (state: DocumentVisibilityState): void => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  document.dispatchEvent(new Event("visibilitychange"));
};

const chromeResize = (): void => {
  window.dispatchEvent(new Event("resize"));
};

// Lets the load flip run and restore, so a test starts from a settled page.
const install = (): void => {
  uninstall = installViewportNudge();
  vi.advanceTimersByTime(200);
};

describe("installViewportNudge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    meta = document.createElement("meta");
    meta.name = "viewport";
    meta.content = CONTENT;
    document.head.append(meta);
  });

  afterEach(() => {
    uninstall();
    meta.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("flips the widget mode off and back on once the load settles", () => {
    uninstall = installViewportNudge();
    vi.advanceTimersByTime(99);
    expect(meta.content).toBe(CONTENT);

    vi.advanceTimersByTime(1);
    expect(meta.content).toBe(FLIPPED);

    vi.advanceTimersByTime(50);
    expect(meta.content).toBe(CONTENT);
  });

  it("flips again shortly after the load, in case the fault arrives late", () => {
    uninstall = installViewportNudge();
    vi.advanceTimersByTime(599);
    expect(meta.content).toBe(CONTENT);

    vi.advanceTimersByTime(1);
    expect(meta.content).toBe(FLIPPED);
    vi.advanceTimersByTime(50);
    expect(meta.content).toBe(CONTENT);

    vi.advanceTimersByTime(950);
    expect(meta.content).toBe(FLIPPED);
  });

  it("waits for the end of a burst of resizes", () => {
    install();
    chromeResize();
    vi.advanceTimersByTime(80);
    chromeResize();
    vi.advanceTimersByTime(80);
    expect(meta.content).toBe(CONTENT);

    vi.advanceTimersByTime(20);
    expect(meta.content).toBe(FLIPPED);
  });

  it("flips again each time the tab shows", () => {
    install();
    setVisibility("hidden");
    setVisibility("visible");
    vi.advanceTimersByTime(100);

    expect(meta.content).toBe(FLIPPED);
  });

  it("waits while the tab is hidden", () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    uninstall = installViewportNudge();
    vi.advanceTimersByTime(200);
    expect(meta.content).toBe(CONTENT);

    setVisibility("visible");
    vi.advanceTimersByTime(100);
    expect(meta.content).toBe(FLIPPED);
  });

  it("leaves the meta alone while a field has focus", () => {
    install();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    chromeResize();
    vi.advanceTimersByTime(100);

    expect(meta.content).toBe(CONTENT);
    field.remove();
  });

  it("does nothing without resizes-content", () => {
    meta.content = "width=device-width, initial-scale=1";
    install();

    expect(meta.content).toBe("width=device-width, initial-scale=1");
  });

  // The nudge cannot fix this one: after an in-tab load in the Android app `dvh` reads taller than
  // the visible viewport and fires no resize, so a `dvh` body pushes the bottom bar off screen.
  it("leaves the body height to svh, not dvh", () => {
    // `css: false` in the client project turns a `?raw` import into an empty string.
    const styles = readFileSync("src/client/styles.css", "utf8");
    const body = /(?:^|\n)body \{([^}]*)\}/.exec(styles)?.[1]?.replace(/\/\*[\s\S]*?\*\//g, "");

    expect(body).toMatch(/\bheight: 100svh;/);
    expect(body).not.toMatch(/\bdvh\b/);
  });
});
