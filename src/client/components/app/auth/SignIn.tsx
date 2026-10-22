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
    // The top bar sits above it in the shell, so the viewport minus that bar centers the block.
    <div className="grid min-h-[calc(100svh-4rem)] place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        {failure ? (
          <span aria-hidden="true" className="text-5xl leading-none">
            {FAILURE_EMOJI[failure]}
          </span>
        ) : (
          <img src="/favicon-light.svg" alt="" width={48} height={48} />
        )}
        {failureMessage ? (
          <p role="alert" className="max-w-72 text-base font-medium text-ink">
            {failureMessage}
          </p>
        ) : (
          <p className="text-sm text-muted">{shell.signInToRead}</p>
        )}
        <a
          href="/api/auth/login"
          className={`
          rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent
          focus-visible:outline-2 focus-visible:outline-accent
        `}
        >
          {failure ? shell.tryAgain : shell.signIn}
        </a>
      </div>
    </div>
  );
};
