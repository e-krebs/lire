import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const failures = ["failed", "denied", "expired"] as const;
type SigninFailure = (typeof failures)[number];

const isSigninFailure = (value: unknown): value is SigninFailure =>
  failures.some((failure) => failure === value);

export const useSigninFailure = (): SigninFailure | undefined => {
  const search = useLocation({ select: (location) => location.search });
  const navigate = useNavigate({ from: "/" });
  const [failure] = useState(() => (isSigninFailure(search.signin) ? search.signin : undefined));

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

  return failure;
};
