import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useAuthStatus, isSignInRequired } from "client/api/queries";

// Mirrors `useTier`'s pattern: the query cache is an external store, so a Sign-in-required error
// surfacing on *any* query (not just auth status) flips the whole shell over without an Effect.
const useAnySignInRequired = (): boolean => {
  const client = useQueryClient();
  return useSyncExternalStore(
    (onChange) => client.getQueryCache().subscribe(onChange),
    () =>
      client
        .getQueryCache()
        .getAll()
        .some((query) => isSignInRequired(query.state.error)),
  );
};

// The one signed-out answer the root and the routes share. The demo is always signed in.
export const useSignedOut = (): boolean => {
  const authStatus = useAuthStatus();
  const anySignInRequired = useAnySignInRequired();
  if (import.meta.env.VITE_DEMO === "true") return false;
  return authStatus.data?.signedIn === false || anySignInRequired;
};
