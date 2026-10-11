import { hashKey } from "@tanstack/react-query";
import { createContext, useContext, useLayoutEffect } from "react";

interface SourceListKeyStore {
  current: () => readonly unknown[] | undefined;
  register: (queryKey: readonly unknown[]) => () => void;
}

export const createSourceListKeyStore = (): SourceListKeyStore => {
  let current: readonly unknown[] | undefined;
  return {
    current: () => current,
    register: (queryKey) => {
      current = queryKey;
      return () => {
        if (current === queryKey) current = undefined;
      };
    },
  };
};

// Held by the stream view around the grid and the reader, which are siblings: the mounted list
// registers its query key, and a mark from the reader leaves that list fresh. Undefined while no
// list is mounted, so the mark stales every list. A store, not state, since only a mark reads it.
export const SourceListKeyContext = createContext<SourceListKeyStore | undefined>(undefined);

export const useRegisterSourceListKey = (queryKey: readonly unknown[]): void => {
  const store = useContext(SourceListKeyContext);
  const hash = hashKey(queryKey);
  // Keyed on the hash: `queryKey` is a fresh array each render.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => store?.register(queryKey), [store, hash]);
};
