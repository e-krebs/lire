import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isSignInRequired } from "client/api/queries";

const failures = ["failed", "denied", "expired"] as const;
type CallbackFailure = (typeof failures)[number];
export type SigninFailure = CallbackFailure | "ended";

const isSigninFailure = (value: unknown): value is CallbackFailure =>
  failures.some((failure) => failure === value);

// A sign-out clears the status but no query answers sign_in_required, so it never reads as ended.
export const useSigninFailure = ({
  userId,
}: {
  userId: number | undefined;
}): SigninFailure | undefined => {
  const search = useLocation({ select: (location) => location.search });
  const navigate = useNavigate({ from: "/" });
  const client = useQueryClient();
  const signInRequired = useSyncExternalStore(
    (onChange) => client.getQueryCache().subscribe(onChange),
    () =>
      client
        .getQueryCache()
        .getAll()
        .some((query) => isSignInRequired(query.state.error)),
  );
  const [failure] = useState(() => (isSigninFailure(search.signin) ? search.signin : undefined));
  const [hadSession, setHadSession] = useState(userId !== undefined);

  if (userId !== undefined && !hadSession) setHadSession(true);

  useEffect(() => {
    if (search.signin === undefined) return;
    void navigate({
      search: (previous) => {
        const { signin: _signin, ...rest } = previous;
        return rest;
      },
      replace: true,
    });
  }, [navigate, search.signin]);

  return failure ?? (hadSession && signInRequired ? "ended" : undefined);
};
