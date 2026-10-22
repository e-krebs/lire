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
      // OAuth login and callback responses must reach the Worker; Access sets its cookie on /cdn-cgi/ pages too.
      denylist: [/^\/api\//, /^\/cdn-cgi\//],
    }),
  );
}

// An empty list is left out of the body, as `markEntries` does.
const post = async ({
  read,
  unread,
  userId,
}: {
  read: string[];
  unread: string[];
  userId: number;
}): Promise<void> => {
  const response = await fetch("/api/entries/mark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
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

// Throws when the user is unknown, so the rows stay stored for the next sync.
const currentUserId = async (): Promise<number> => {
  const response = await fetch("/api/auth/status", {
    credentials: "same-origin",
    redirect: "manual",
  });
  if (response.status !== 200) throw new Error(`mark-read sync status failed: ${response.status}`);
  const body = (await response.json()) as { signedIn?: boolean; userId?: unknown };
  if (!body.signedIn || typeof body.userId !== "number") {
    throw new Error("mark-read sync: no signed-in user");
  }
  return body.userId;
};

self.addEventListener("sync", (event) => {
  if (event.tag === MARK_SYNC_TAG) {
    event.waitUntil(syncPending({ store: markStore, post, currentUserId }));
  }
});
