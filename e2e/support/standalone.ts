import type { Page } from "@playwright/test";

export const mockStandalone = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = matchMedia(query);
      if (query !== "(display-mode: standalone)") return media;
      return new Proxy(media, {
        get: (target, property) => {
          if (property === "matches") return true;
          const value: unknown = Reflect.get(target, property, target);
          return value;
        },
      });
    };
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
  });
};
