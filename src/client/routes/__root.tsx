import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { AppShell } from "client/components/app/shell/AppShell";
import { SignIn } from "client/components/app/auth/SignIn";
import { DemoBanner } from "client/components/app/demo/DemoBanner";
import { SWToast } from "client/components/app/notices/SWToast";
import { markQueue } from "client/api/markQueue";
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
  const userId = authStatus.data?.userId;
  const unknownUser = authStatus.isError || (authStatus.data !== undefined && userId === undefined);
  const { dataUpdatedAt } = authStatus;

  // A refetch re-runs this, since a `clear` forgets the user the same id would set again.
  useEffect(() => {
    if (userId !== undefined) void markQueue.setUser({ userId });
    else if (unknownUser) markQueue.noUser();
  }, [userId, unknownUser, dataUpdatedAt]);

  const signedOut = authStatus.data?.signedIn === false || anySignInRequired;

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-none">{import.meta.env.VITE_DEMO === "true" && <DemoBanner />}</div>
        <div className="min-h-0 flex-1">
          {import.meta.env.VITE_DEMO !== "true" && signedOut ? <SignIn /> : <Outlet />}
        </div>
      </div>
      <SWToast />
    </AppShell>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
