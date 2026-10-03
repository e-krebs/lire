import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { markReadQueue } from "client/api/markReadQueue";
import { setLocalePreference } from "client/i18n/locale";
import { setViewPrefs } from "client/utils/viewPrefs";
import { server } from "./msw";

// Snapshots of what a test may stub, restored after every test so no file restores its own.
const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
const prototypes = [HTMLElement.prototype, Element.prototype].map((prototype) => ({
  prototype,
  descriptors: Object.getOwnPropertyDescriptors(prototype),
}));

const restorePrototypes = (): void => {
  for (const { prototype, descriptors } of prototypes) {
    for (const key of Reflect.ownKeys(prototype)) {
      if (!(key in descriptors)) Reflect.deleteProperty(prototype, key);
    }
    for (const [key, descriptor] of Object.entries(descriptors)) {
      const current = Object.getOwnPropertyDescriptor(prototype, key);
      if (current?.value !== descriptor.value || current?.get !== descriptor.get) {
        Object.defineProperty(prototype, key, descriptor);
      }
    }
  }
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  // Files share one module graph, so a read mark still batched must not flush into a later test.
  markReadQueue.reset();
  server.resetHandlers();
  server.events.removeAllListeners();
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  restorePrototypes();
  if (localStorageDescriptor) Object.defineProperty(window, "localStorage", localStorageDescriptor);
  else Reflect.deleteProperty(window, "localStorage");
  // The store outlives the cleared storage, so put its defaults back first.
  setViewPrefs({ unread: true, ranked: "newest" });
  setLocalePreference("system");
  document.documentElement.lang = "en";
  window.localStorage.clear();
});

afterAll(() => {
  server.close();
});
