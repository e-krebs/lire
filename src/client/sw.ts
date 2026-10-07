import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { syncPending } from "./api/markSync";
import { isRetryable, MARK_SYNC_TAG, markStore } from "./api/markStore";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") void self.skipWaiting();
});
// Load-bearing: without it the first install leaves open tabs uncontrolled until reload.
clientsClaim();

// The dev manifest is nearly empty, so /index.html is not precached there.
if (!import.meta.env.DEV) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL("/index.html"), {
      // The Worker serves /api/auth/login as HTML, and Access sets its cookie on /cdn-cgi/ pages: the SPA shell must shadow neither.
      denylist: [/^\/api\//, /^\/cdn-cgi\//],
    }),
  );
}

// An empty list is left out of the body, as `markEntries` does.
const post = async ({ read, unread }: { read: string[]; unread: string[] }): Promise<void> => {
  const response = await fetch("/api/entries/mark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(read.length > 0 && { read }),
      ...(unread.length > 0 && { unread }),
    }),
    credentials: "same-origin",
    redirect: "manual",
  });
  if (response.type === "opaqueredirect" || isRetryable(response.status)) {
    throw new Error(`mark-read sync failed: ${response.status}`);
  }
};

self.addEventListener("sync", (event) => {
  if (event.tag === MARK_SYNC_TAG) {
    event.waitUntil(syncPending({ store: markStore, post }));
  }
});
