import type { ErrorComponentProps } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { useT } from "client/i18n/useT";

export const RouteError = ({ error, children }: ErrorComponentProps & { children?: ReactNode }) => {
  const { shell } = useT();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <span aria-hidden="true" className="text-5xl leading-none">
        ⚠️
      </span>
      <p role="alert" className="max-w-72 text-base font-medium text-ink">
        {shell.routeErrorTitle}
      </p>
      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        {shell.routeErrorReload}
      </button>
      {children}
    </div>
  );
};
