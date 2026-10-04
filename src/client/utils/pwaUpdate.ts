// Whether a new version or offline support is ready, from the service worker registration.

import { useSyncExternalStore } from "react";
import { markReadQueue } from "client/api/markReadQueue";

export interface PwaState {
  updateReady: boolean;
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

const IDLE: PwaState = { updateReady: false, offlineReady: false };

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

export const dismiss = ({ kind }: { kind: "update" | "offline" }): void => {
  set(kind === "update" ? { updateReady: false } : { offlineReady: false });
};

export const applyUpdate = async (): Promise<void> => {
  // Reloading would drop marks still waiting in the batch.
  await markReadQueue.flush();
  await updateSW?.(true);
};

export const registerPwa = ({ register }: { register: Register }): void => {
  updateSW = register({
    immediate: true,
    onNeedRefresh: () => {
      set({ updateReady: true });
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
