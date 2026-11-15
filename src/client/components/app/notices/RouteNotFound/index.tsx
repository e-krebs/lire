import { Link } from "@tanstack/react-router";
import { useT } from "client/i18n/useT";

export const RouteNotFound = () => {
  const { shell } = useT();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <span aria-hidden="true" className="text-5xl leading-none">
        🧭
      </span>
      <p className="max-w-72 text-base font-medium text-ink">{shell.notFoundTitle}</p>
      <Link
        to="/"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        {shell.notFoundBackHome}
      </Link>
    </div>
  );
};
