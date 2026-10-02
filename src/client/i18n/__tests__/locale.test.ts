import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { setLocalePreference, useLocale, useLocalePreference } from "../locale";

const STORAGE_KEY = "lire.locale";

// The store reads localStorage once, at import: a stored value only reaches it through a
// fresh module instance. A later file may import that instance, so the test puts it back to
// "system" before it ends.
const freshStore = async () => {
  vi.resetModules();
  return import("../locale");
};

const setup = ({ languages }: { languages?: string[] } = {}) => {
  if (languages) vi.stubGlobal("navigator", { languages });
  return renderHook(() => ({ locale: useLocale(), preference: useLocalePreference() }));
};

describe("locale", () => {
  describe("when the preference is system", () => {
    it("follows an English browser", () => {
      const { result } = setup({ languages: ["en-GB", "fr-FR"] });
      expect(result.current).toEqual({ locale: "en", preference: "system" });
    });

    it("follows the first French or English entry", () => {
      const { result } = setup({ languages: ["de-DE", "fr-CA", "en-US"] });
      expect(result.current.locale).toBe("fr");
    });

    it("falls back to English when the browser asks for neither", () => {
      const { result } = setup({ languages: ["de-DE"] });
      expect(result.current.locale).toBe("en");
    });

    it("follows a languagechange event", () => {
      const { result } = setup({ languages: ["en-US"] });
      act(() => {
        vi.stubGlobal("navigator", { languages: ["fr-FR"] });
        window.dispatchEvent(new Event("languagechange"));
      });
      expect(result.current.locale).toBe("fr");
      expect(document.documentElement.lang).toBe("fr");
    });
  });

  describe("when a locale is picked", () => {
    it("overrides the browser and sets the lang attribute", () => {
      const { result } = setup({ languages: ["en-US"] });
      act(() => {
        setLocalePreference("fr");
      });
      expect(result.current).toEqual({ locale: "fr", preference: "fr" });
      expect(document.documentElement.lang).toBe("fr");
    });

    it("persists the choice", () => {
      setup();
      act(() => {
        setLocalePreference("fr");
      });
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe("fr");
    });
  });

  describe("when a value is stored", () => {
    it("restores a stored locale and sets the lang attribute at load", async () => {
      window.localStorage.setItem(STORAGE_KEY, "fr");
      const store = await freshStore();
      const { result } = renderHook(() => store.useLocale());
      expect(result.current).toBe("fr");
      expect(document.documentElement.lang).toBe("fr");
      act(() => {
        store.setLocalePreference("system");
      });
    });

    it("reads an unknown value as system", async () => {
      window.localStorage.setItem(STORAGE_KEY, "de");
      const store = await freshStore();
      const { result } = renderHook(() => store.useLocalePreference());
      expect(result.current).toBe("system");
    });
  });

  describe("when storage is unavailable", () => {
    it("keeps the choice for the session", async () => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new Error("blocked");
        },
      });
      const store = await freshStore();
      const { result } = renderHook(() => store.useLocale());
      act(() => {
        store.setLocalePreference("fr");
      });
      expect(result.current).toBe("fr");
      act(() => {
        store.setLocalePreference("system");
      });
    });
  });
});
