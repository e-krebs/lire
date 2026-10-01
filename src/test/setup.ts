import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { reloadViewPrefs } from "client/utils/viewPrefs";
import { server } from "./msw";

// Snapshots of what a test may stub, restored after every test so no file restores its own.
const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
const htmlElementDescriptors = Object.getOwnPropertyDescriptors(HTMLElement.prototype);

const restoreHtmlElementPrototype = (): void => {
  for (const key of Reflect.ownKeys(HTMLElement.prototype)) {
    if (!(key in htmlElementDescriptors)) Reflect.deleteProperty(HTMLElement.prototype, key);
  }
  for (const [key, descriptor] of Object.entries(htmlElementDescriptors)) {
    const current = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
    if (current?.value !== descriptor.value || current?.get !== descriptor.get) {
      Object.defineProperty(HTMLElement.prototype, key, descriptor);
    }
  }
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  server.events.removeAllListeners();
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  restoreHtmlElementPrototype();
  if (localStorageDescriptor) Object.defineProperty(window, "localStorage", localStorageDescriptor);
  else Reflect.deleteProperty(window, "localStorage");
  window.localStorage.clear();
  reloadViewPrefs();
});

afterAll(() => {
  server.close();
});
