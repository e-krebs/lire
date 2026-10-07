// Whether a new version or offline support is ready, from the service worker registration.

import { useSyncExternalStore } from "react";
import { markQueue } from "client/api/markQueue";

export interface PwaState {
  updateReady: boolean;
  // The toast was sent away with Later: the update still waits, and the cog menu still offers it.
  updateDeferred: boolean;
  offlineReady: boolean;
}

interface RegisterOptions {
  immediate: boolean;
  onNeedRefresh: () => void;
  onOfflineReady: () => void;
  onRegisteredSW: (
    url: string,
    registration: { update: () => Promise<unknown> } | undefined,
  ) => void;
}

type Register = (options: RegisterOptions) => (reloadPage?: boolean) => Promise<void>;

const UPDATE_CHECK_MS = 60 * 60 * 1000;

const IDLE: PwaState = { updateReady: false, updateDeferred: false, offlineReady: false };

let state = IDLE;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

const listeners = new Set<() => void>();

const set = (next: Partial<PwaState>): void => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

const getSnapshot = (): PwaState => state;

export const deferUpdate = (): void => {
  set({ updateDeferred: true });
};

export const dismissOffline = (): void => {
  set({ offlineReady: false });
};

const FLUSH_TIMEOUT_MS = 2000;
const RELOAD_FALLBACK_MS = 3000;

const flushWithin = async ({ ms }: { ms: number }): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  // Reloading would drop marks still waiting in the batch.
  await Promise.race([markQueue.flush().catch(() => {}), timeout]);
  clearTimeout(timer);
};

export const applyUpdate = async (): Promise<void> => {
  await flushWithin({ ms: FLUSH_TIMEOUT_MS });
  const registration =
    "serviceWorker" in navigator
      ? await navigator.serviceWorker.getRegistration().catch(() => undefined)
      : undefined;
  // Without a waiting worker or a controller, vite-plugin-pwa never reloads.
  if (!updateSW || !registration?.waiting || !navigator.serviceWorker.controller) {
    window.location.reload();
    return;
  }
  setTimeout(() => {
    window.location.reload();
  }, RELOAD_FALLBACK_MS);
  await updateSW(true);
};

export const registerPwa = ({ register }: { register: Register }): void => {
  set(IDLE);
  updateSW = register({
    immediate: true,
    onNeedRefresh: () => {
      set({ updateReady: true, updateDeferred: false });
    },
    onOfflineReady: () => {
      set({ offlineReady: true });
    },
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      const check = (): void => {
        void registration.update().catch(() => {});
      };
      // Installed PWAs and the Android app rarely reload on their own.
      setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
};

export const usePwaUpdate = (): PwaState =>
  useSyncExternalStore(subscribe, getSnapshot, () => IDLE);
