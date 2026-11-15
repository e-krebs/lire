// Counts the failed tagged writes the user has not dismissed; 0 means no notice.

import { useSyncExternalStore } from "react";

interface WriteFailureState {
  failureId: number;
}

const IDLE: WriteFailureState = { failureId: 0 };

let state = IDLE;

const listeners = new Set<() => void>();

const set = (next: WriteFailureState): void => {
  state = next;
  for (const listener of listeners) listener();
};

const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

const getSnapshot = (): WriteFailureState => state;

export const reportWriteFailure = (): void => {
  set({ failureId: state.failureId + 1 });
};

export const dismissWriteFailure = (): void => {
  set({ failureId: 0 });
};

export const useWriteFailure = (): WriteFailureState =>
  useSyncExternalStore(subscribe, getSnapshot, () => IDLE);
