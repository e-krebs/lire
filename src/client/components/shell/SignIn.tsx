interface SignInProps {
  /** Show the sign-in failure message. */
  error?: boolean;
}

export const SignIn = ({ error }: SignInProps) => (
  <div className="grid h-full place-items-center p-6 text-center">
    <div className="flex flex-col items-center gap-4">
      <img src="/favicon-light.svg" alt="" width={48} height={48} />
      <p className="text-sm text-muted">
        {error ? "Sign-in failed, try again." : "Sign in to read your subscriptions."}
      </p>
      <a
        href="/api/auth/login"
        className={`
          rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent
          focus-visible:outline-2 focus-visible:outline-accent
        `}
      >
        Sign in
      </a>
    </div>
  </div>
);
