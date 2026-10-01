import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { AppShell } from "client/components/shell/AppShell";
import { SignIn } from "client/components/shell/SignIn";
import { DemoBanner } from "client/components/shell/DemoBanner";
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

const RootComponent = () => {
  const authStatus = useAuthStatus();
  const anySignInRequired = useAnySignInRequired();

  const signedOut = authStatus.data?.signedIn === false || anySignInRequired;

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-none">{import.meta.env.VITE_DEMO === "true" && <DemoBanner />}</div>
        <div className="min-h-0 flex-1">
          {import.meta.env.VITE_DEMO !== "true" && signedOut ? <SignIn /> : <Outlet />}
        </div>
      </div>
    </AppShell>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
