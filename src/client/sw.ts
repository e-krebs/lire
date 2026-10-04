import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { syncPending } from "./api/markReadSync";
import { isRetryable, MARK_READ_SYNC_TAG, markReadStore } from "./api/markReadStore";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
// Load-bearing: without it the first install leaves open tabs uncontrolled until reload.
clientsClaim();

// The dev manifest is nearly empty, so /index.html is not precached there.
if (!import.meta.env.DEV) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL("/index.html"), {
      // The Worker serves /api/auth/login as HTML; the SPA shell must not shadow it.
      denylist: [/^\/api\//],
    }),
  );
}

const post = async (entryIds: string[]): Promise<void> => {
  const response = await fetch("/api/entries/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryIds }),
    credentials: "same-origin",
    redirect: "manual",
  });
  if (response.type === "opaqueredirect" || isRetryable(response.status)) {
    throw new Error(`mark-read sync failed: ${response.status}`);
  }
};

self.addEventListener("sync", (event) => {
  if (event.tag === MARK_READ_SYNC_TAG) {
    event.waitUntil(syncPending({ store: markReadStore, post }));
  }
});
