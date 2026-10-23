// The browser's install prompt, kept from the moment it fires so a button can show it later.

import { useSyncExternalStore } from "react";
import { isInstalled, isTWA } from "client/utils/externalLinks";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  deferred?: BeforeInstallPromptEvent;
  installed: boolean;
}

const initialState: InstallState = { installed: false };

let state = initialState;

const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

const getSnapshot = (): InstallState => state;

const update = (next: InstallState): void => {
  state = next;
  notify();
};

const isBeforeInstallPrompt = (event: Event): event is BeforeInstallPromptEvent =>
  "prompt" in event && typeof event.prompt === "function";

const onBeforeInstall = (event: Event): void => {
  event.preventDefault();
  if (!isBeforeInstallPrompt(event)) return;
  update({ deferred: event, installed: false });
};

const onInstalled = (): void => {
  update({ installed: true });
};

export const listenForInstallPrompt = (target: Window = window): (() => void) => {
  target.addEventListener("beforeinstallprompt", onBeforeInstall);
  target.addEventListener("appinstalled", onInstalled);
  return () => {
    target.removeEventListener("beforeinstallprompt", onBeforeInstall);
    target.removeEventListener("appinstalled", onInstalled);
  };
};

const install = async (): Promise<void> => {
  const event = state.deferred;
  if (event === undefined) return;
  update({ installed: state.installed });
  try {
    await event.prompt();
    await event.userChoice;
  } catch {
    // A prompt that cannot show is spent, so the button goes as it would after a dismissal.
  }
};

// Fullscreen is a desktop browser tab that can still offer the install, so it does not count.
export const isInstalledApp = (): boolean =>
  isInstalled({ displayModes: ["standalone", "minimal-ui"] }) || isTWA();

export const useInstallPrompt = (): {
  canInstall: boolean;
  installed: boolean;
  install: () => Promise<void>;
} => {
  const { deferred, installed } = useSyncExternalStore(subscribe, getSnapshot, () => initialState);
  return { canInstall: deferred !== undefined, installed, install };
};
