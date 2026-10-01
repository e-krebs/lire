import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { isMockMode } from "client/api/client";
import { useAuthStatus, useProfile } from "client/api/queries";
import { useBarPosition } from "client/hooks/useBarPosition";
import { setBarPosition } from "client/hooks/utils/barPosition";
import { Icon } from "client/components/ui/icons";
import { Switch } from "client/components/ui/Switch";
import { swallowNextClick } from "client/utils/swallowNextClick";
import { tip } from "client/utils/tooltip";
import { useOverlay } from "client/hooks/useOverlay";

const triggerClassName = `
  inline-flex size-10 flex-none items-center justify-center rounded-full text-muted
  [anchor-name:--account]
  hover:bg-surface-2
  focus-visible:outline-2 focus-visible:outline-accent
  aria-expanded:bg-surface-2 aria-expanded:text-ink
`;

const rowClassName = `
  flex min-h-9 items-center justify-between gap-3 px-3 text-sm
`;

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className={rowClassName}>
    <span className="flex-none text-muted">{label}</span>
    <span className="min-w-0 truncate text-right text-ink">{children}</span>
  </div>
);

// Everything the old settings page held, in a native `popover="auto"` panel under the cog: light
// dismiss and the top layer come for free, and CSS anchor positioning keeps it on the trigger.
export const AccountMenu = () => {
  const id = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const profile = useProfile();
  const authStatus = useAuthStatus();
  const barPosition = useBarPosition();
  const mock = isMockMode();
  useOverlay({ id: "account-menu", isOpen: open });

  const close = (): void => {
    popoverRef.current?.hidePopover();
  };

  // Light dismiss closes the popover on a press outside, then lets that press click whatever was
  // under it: a card, a pill. The click is swallowed here instead. The trigger is excluded, since
  // its own click is the toggle.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return;
      if (popoverRef.current?.contains(event.target)) return;
      if (triggerRef.current?.contains(event.target)) return;
      swallowNextClick();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        {...tip({ label: "Account and app info" })}
        className={triggerClassName}
      >
        <Icon name="settings" />
      </button>
      <div
        ref={popoverRef}
        id={id}
        popover="auto"
        role="group"
        aria-label="Account and app info"
        onToggle={(event) => {
          setOpen(event.newState === "open");
        }}
        className={`
          account-menu w-72 rounded-2xl border border-hairline bg-surface p-2 text-ink shadow-lg
        `}
      >
        <div className="px-3 py-1.5">
          <p
            data-tip={profile.data?.fullName}
            data-tip-overflow=""
            className="truncate text-sm font-semibold text-ink"
          >
            {profile.data?.fullName ?? "—"}
          </p>
          <p
            data-tip={profile.data?.email}
            data-tip-overflow=""
            className="truncate text-xs text-faint"
          >
            {profile.data?.email ?? "—"}
          </p>
        </div>

        {import.meta.env.VITE_DEMO !== "true" && (
          <Row label="Account">
            {mock ? (
              "Mock data"
            ) : authStatus.data?.signedIn ? (
              "Signed in"
            ) : (
              <a
                href="/api/auth/login"
                className={`
                  text-accent-text underline underline-offset-2
                  focus-visible:outline-2 focus-visible:outline-accent
                `}
              >
                Sign in
              </a>
            )}
          </Row>
        )}
        {/* Per device, not per account: the choice lives in localStorage. */}
        <Switch
          checked={barPosition === "bottom"}
          onChange={(checked) => {
            setBarPosition(checked ? "bottom" : "top");
          }}
          className="mx-3 justify-between"
        >
          Bar at the bottom
        </Switch>

        <hr className="my-2 border-hairline" />

        <Link
          to="/subscriptions"
          onClick={close}
          className={`
            flex h-10 items-center rounded-xl px-3 text-sm font-medium text-ink
            hover:bg-surface-2
            focus-visible:outline-2 focus-visible:outline-accent
          `}
        >
          Manage subscriptions
        </Link>
      </div>
    </>
  );
};
