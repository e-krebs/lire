import { Link } from "@tanstack/react-router";
import { AndroidBadge } from "client/components/app/auth/landing/AndroidBadge";
import { DeviceFigures } from "client/components/app/auth/landing/DeviceFigures";
import { FluidDemos } from "client/components/app/auth/landing/FluidDemos";
import { StepCards } from "client/components/app/auth/landing/StepCards";
import { useT } from "client/i18n/useT";

type SignInFailure = "failed" | "denied" | "expired";

const FAILURE_EMOJI: Record<SignInFailure, string> = {
  failed: "⚠️",
  denied: "🚫",
  expired: "⏳",
};

export interface SignInProps {
  /** Why the last sign-in did not finish. Absent on the plain sign-in page. */
  failure?: SignInFailure;
}

export const SignIn = ({ failure }: SignInProps) => {
  const { shell } = useT();
  const failureMessage = failure
    ? {
        failed: shell.signInFailed,
        denied: shell.signInDenied,
        expired: shell.signInExpired,
      }[failure]
    : null;
  return (
    <div className="flex min-h-full flex-col">
      {!failure && (
        <div className="flex items-center justify-center gap-3 px-6 pt-16 sm:pt-24">
          <img src="/favicon-light.svg" alt="" width={32} height={32} />
          <span className="text-lg font-semibold text-ink">{shell.lireName}</span>
        </div>
      )}
      <div className="flex flex-1 flex-col items-center justify-center gap-20 p-6 text-center sm:gap-28">
        {failure ? (
          <div className="flex flex-col items-center gap-4">
            <span aria-hidden="true" className="text-5xl leading-none">
              {FAILURE_EMOJI[failure]}
            </span>
            <p role="alert" className="max-w-72 text-base font-medium text-ink">
              {failureMessage}
            </p>
            <SignInButton label={shell.tryAgain} />
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-muted">{shell.signInToRead}</p>
              <SignInButton label={shell.signIn} />
            </div>
            <StepCards />
            <div className="flex w-full flex-col items-center gap-2">
              <DeviceFigures />
              <AndroidBadge />
            </div>
            <FluidDemos />
            <SignInButton label={shell.signIn} />
          </>
        )}
      </div>
      <footer className="p-6 text-center text-sm">
        <Link
          to="/credits"
          className="rounded-sm font-medium text-accent-text underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          {shell.credits}
        </Link>
      </footer>
    </div>
  );
};

const SignInButton = ({ label }: { label: string }) => (
  <a
    href="/api/auth/login"
    className={`
      rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent
      focus-visible:outline-2 focus-visible:outline-accent
    `}
  >
    {label}
  </a>
);
