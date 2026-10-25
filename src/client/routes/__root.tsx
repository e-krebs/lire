import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "client/components/app/shell/AppShell";
import { SignIn } from "client/components/app/auth/SignIn";
import { DemoBanner } from "client/components/app/demo/DemoBanner";
import { SWToast } from "client/components/app/notices/SWToast";
import { markQueue } from "client/api/markQueue";
import { useAuthStatus } from "client/api/queries";
import { useSignedOut } from "client/hooks/useSignedOut";
import { useSigninFailure } from "client/hooks/useSigninFailure";
import { useT } from "client/i18n/useT";

const RootComponent = () => {
  const authStatus = useAuthStatus();
  const signedOut = useSignedOut();
  const pathname = useLocation({ select: (location) => location.pathname });
  const userId = authStatus.data?.userId;
  const signinFailure = useSigninFailure({ userId });
  const { shell } = useT();
  // A paused request waits for connectivity, so it must not hold the splash until then.
  const splash =
    import.meta.env.VITE_DEMO !== "true" &&
    pathname !== "/credits" &&
    authStatus.isPending &&
    authStatus.fetchStatus !== "paused";
  const unknownUser = authStatus.isError || (authStatus.data !== undefined && userId === undefined);
  const { dataUpdatedAt } = authStatus;

  // A refetch re-runs this, since a `clear` forgets the user the same id would set again.
  useEffect(() => {
    if (userId !== undefined) void markQueue.setUser({ userId });
    else if (unknownUser) markQueue.noUser();
  }, [userId, unknownUser, dataUpdatedAt]);

  return (
    <AppShell bare={splash || signedOut}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-none">{import.meta.env.VITE_DEMO === "true" && <DemoBanner />}</div>
        <div className="min-h-0 flex-1">
          {splash ? (
            <div
              aria-label={shell.checkingSession}
              className="flex h-full items-center justify-center text-sm text-muted"
              role="status"
            >
              {shell.checkingSession}
            </div>
          ) : signedOut && pathname !== "/credits" ? (
            <SignIn failure={signinFailure} />
          ) : (
            <Outlet />
          )}
        </div>
      </div>
      <SWToast />
    </AppShell>
  );
};

export const Route = createRootRoute({
  validateSearch: (search: Record<string, unknown>): { signin?: unknown } => ({
    signin: search.signin,
  }),
  component: RootComponent,
});
