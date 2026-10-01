import { useEffect, useSyncExternalStore } from "react";

// Which light-dismiss surfaces (the account menu, the desktop Navigator) are open. While any is,
// the shell makes the content behind them inert: no hover, no click, no focus landing there. The
// phone sheet is a modal dialog and gets that from the browser. The header asks which opened last
// (Set order is insertion order), so the items that own it stay live.
const open = new Set<string>();
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useOverlayOpen = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => open.size > 0,
    () => false,
  );

const lastOpen = (): string | null => {
  let last: string | null = null;
  for (const id of open) last = id;
  return last;
};

export const useActiveOverlay = (): string | null =>
  useSyncExternalStore(subscribe, lastOpen, () => null);

// Registers a surface for as long as `isOpen` holds.
export const useOverlay = ({ id, isOpen }: { id: string; isOpen: boolean }): void => {
  useEffect(() => {
    if (!isOpen) return undefined;
    open.add(id);
    notify();
    return () => {
      open.delete(id);
      notify();
    };
  }, [id, isOpen]);
};
