import type { ReactNode } from "react";

const buttonClass = `
  min-h-11 rounded-full bg-surface-2 px-3 py-1 font-medium text-ink
  hover:bg-hairline
  focus-visible:outline-2 focus-visible:outline-accent
`;

// With `leaving`, the toast flies into the cog and calls `onLeft` once the flight is done.
export const Toast = ({
  children,
  leaving = false,
  onLeft,
}: {
  children: ReactNode;
  leaving?: boolean;
  onLeft?: () => void;
}) => (
  <p
    onAnimationEnd={(event) => {
      if (event.animationName === "toast-absorb-fade") onLeft?.();
    }}
    className={`${leaving ? "toast-absorb" : ""} pointer-events-auto flex items-center gap-3 rounded-full bg-accent-soft py-2 pr-2 pl-4 text-sm text-accent-text shadow-lg`}
  >
    {children}
  </p>
);

export const ToastButton = ({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) => (
  <button type="button" onClick={onClick} className={buttonClass}>
    {children}
  </button>
);
