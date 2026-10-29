import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { isMockMode } from "client/api/client";
import { useProfile } from "client/api/queries";
import { signOut } from "client/api/signOut";
import { AndroidAppLink } from "client/components/app/android/AndroidAppLink";
import { useBarPosition } from "client/hooks/useBarPosition";
import { useOnboardingCard } from "client/hooks/useOnboardingCard";
import { setBarPosition } from "client/hooks/utils/barPosition";
import { Icon } from "client/components/primitives/icons/icons";
import { Switch } from "client/components/primitives/controls/Switch";
import { isAndroidBrowser } from "client/utils/androidApp";
import { isInstalledApp, useInstallPrompt } from "client/utils/installPrompt";
import { swallowNextClick } from "client/utils/swallowNextClick";
import { tip } from "client/utils/tooltip";
import { useOverlay } from "client/hooks/useOverlay";
import { setLocalePreference, useLocalePreference } from "client/i18n/locale";
import type { LocalePreference } from "client/i18n/locale";
import { useT } from "client/i18n/useT";
import { applyUpdate, usePwaUpdate } from "client/utils/pwaUpdate";
import {
  browserChoices,
  getPreferredBrowser,
  setPreferredBrowser,
  type BrowserId,
} from "client/utils/externalLinks";

const triggerClassName = `
  relative inline-flex size-10 flex-none items-center justify-center rounded-full text-muted
  hover:bg-surface-2
  focus-visible:outline-2 focus-visible:outline-accent
  aria-expanded:bg-surface-2 aria-expanded:text-ink
`;

const rowClassName = `
  flex min-h-9 items-center justify-between gap-3 px-3 text-sm
`;

// appearance-none drops the native caret; the end padding leaves room for SelectChevron.
const selectClassName = `
  h-8 min-w-0 appearance-none rounded-lg border border-hairline bg-surface ps-2 pe-7 text-ink
  focus-visible:outline-2 focus-visible:outline-accent
`;

const SelectChevron = () => (
  <Icon
    name="chevron"
    className="pointer-events-none absolute inset-e-2 top-1/2 size-4 -translate-y-1/2 rotate-90 text-muted"
  />
);

// Only an installed iOS app or the Android TWA has a browser to pick, so elsewhere the row is absent.
const ExternalBrowserSelect = () => {
  const { shell } = useT();
  const choices = browserChoices({ defaultLabel: shell.defaultBrowser });
  const [browser, setBrowser] = useState(getPreferredBrowser);
  if (choices.length === 0) return null;
  const options: { id: BrowserId; label: string }[] = [
    ...choices,
    { id: "none", label: shell.thisApp },
  ];
  return (
    <label className={rowClassName}>
      <span className="flex-none text-muted">{shell.openExternalLinksIn}</span>
      <span className="relative flex min-w-0">
        <select
          value={browser ?? "none"}
          onChange={(event) => {
            const next = options.find(({ id }) => id === event.target.value)?.id;
            if (next === undefined) return;
            setPreferredBrowser(next);
            setBrowser(next);
          }}
          className={selectClassName}
        >
          {options.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <SelectChevron />
      </span>
    </label>
  );
};

const LanguageSelect = () => {
  const { shell } = useT();
  const preference = useLocalePreference();
  const options: { id: LocalePreference; label: string }[] = [
    { id: "system", label: shell.languageSystem },
    { id: "en", label: shell.languageEnglish },
    { id: "fr", label: shell.languageFrench },
  ];
  return (
    <label className={rowClassName}>
      <span className="flex-none text-muted">{shell.language}</span>
      <span className="relative flex min-w-0">
        <select
          data-account-menu-language=""
          value={preference}
          onChange={(event) => {
            const next = options.find(({ id }) => id === event.target.value)?.id;
            if (next === undefined) return;
            setLocalePreference(next);
          }}
          className={selectClassName}
        >
          {options.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <SelectChevron />
      </span>
    </label>
  );
};

// Everything the old settings page held, in a native `popover="auto"` panel under the cog: light
// dismiss and the top layer come for free, and CSS anchor positioning keeps it on the trigger.
export const AccountMenu = () => {
  const id = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const profile = useProfile();
  const barPosition = useBarPosition();
  const onboarding = useOnboardingCard();
  const mock = isMockMode();
  const { updateReady, updateDeferred } = usePwaUpdate();
  const { canInstall, install } = useInstallPrompt();
  const { shell, onboarding: onboardingCopy } = useT();
  // The Android app link is the install route in Android Chrome, so the install row yields to it.
  const showInstall = canInstall && !isInstalledApp() && !isAndroidBrowser();
  useOverlay({ id: "account-menu", isOpen: open });

  useEffect(() => {
    const focusLanguageSelect = (): void => {
      // Through the trigger, as a click opens it: a bare showPopover() has no invoker, so the
      // anchor is unset and the panel lands at the top left.
      if (!popoverRef.current?.matches(":popover-open")) triggerRef.current?.click();
      requestAnimationFrame(() => {
        popoverRef.current
          ?.querySelector<HTMLSelectElement>("[data-account-menu-language]")
          ?.focus();
      });
    };
    window.addEventListener("lire:focus-language-select", focusLanguageSelect);
    return () => {
      window.removeEventListener("lire:focus-language-select", focusLanguageSelect);
    };
  }, []);

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
        id="account-menu-trigger"
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        {...tip({ label: shell.accountAndAppInfo })}
        className={triggerClassName}
      >
        <Icon name="settings" />
        {updateReady && updateDeferred ? (
          <span
            aria-hidden="true"
            className="update-dot absolute top-2 right-2 size-2 rounded-full bg-accent"
          />
        ) : null}
      </button>
      <div
        ref={popoverRef}
        id={id}
        popover="auto"
        role="group"
        aria-label={shell.accountAndAppInfo}
        onToggle={(event) => {
          setOpen(event.newState === "open");
        }}
        className={`
          account-menu w-72 rounded-2xl border border-hairline bg-surface p-2 text-ink shadow-lg
        `}
      >
        {import.meta.env.VITE_DEMO !== "true" && (
          <div className={rowClassName}>
            <p
              data-tip={profile.data?.email}
              data-tip-overflow=""
              className="min-w-0 flex-1 truncate font-semibold text-ink"
            >
              {profile.data?.username ?? "—"}
            </p>
            {mock ? (
              <span className="flex-none text-muted">{shell.mockData}</span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  close();
                  // A failed sign-out keeps the session, so the row keeps showing it.
                  void signOut().catch(() => {});
                }}
                className={`
                  flex-none text-accent-text underline underline-offset-2
                  focus-visible:outline-2 focus-visible:outline-accent
                `}
              >
                {shell.signOut}
              </button>
            )}
          </div>
        )}

        {updateReady ? (
          <button
            type="button"
            onClick={() => {
              close();
              void applyUpdate();
            }}
            className={`
              flex h-10 w-full items-center rounded-xl bg-accent-soft px-3 text-sm font-medium
              text-accent-text
              hover:bg-surface-2
              focus-visible:outline-2 focus-visible:outline-accent
            `}
          >
            {shell.reloadToUpdate}
          </button>
        ) : null}

        {/* Per device, not per account: the choice lives in localStorage. */}
        <Switch
          checked={barPosition === "bottom"}
          onChange={(checked) => {
            setBarPosition(checked ? "bottom" : "top");
          }}
          className="mx-3 justify-between"
        >
          {shell.barAtBottom}
        </Switch>
        {onboarding.state?.dismissed && !onboarding.completed ? (
          <button
            type="button"
            onClick={() => {
              onboarding.setDismissed(false);
              close();
            }}
            className={`
              flex h-10 w-full items-center rounded-xl px-3 text-sm font-medium text-ink
              hover:bg-surface-2
              focus-visible:outline-2 focus-visible:outline-accent
            `}
          >
            {onboardingCopy.menu.show}
          </button>
        ) : null}
        <ExternalBrowserSelect />
        <LanguageSelect />

        <hr className="my-2 border-hairline" />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            to="/subscriptions"
            onClick={close}
            className={`
              flex h-10 items-center rounded-xl px-3 text-sm font-medium text-ink
              hover:bg-surface-2
              focus-visible:outline-2 focus-visible:outline-accent
            `}
          >
            {shell.manageSubscriptions}
          </Link>
          <Link
            to="/credits"
            onClick={close}
            className={`
              flex h-10 items-center rounded-xl px-3 text-sm font-medium text-ink
              hover:bg-surface-2
              focus-visible:outline-2 focus-visible:outline-accent
            `}
          >
            {shell.credits}
          </Link>
          {showInstall ? (
            <button
              type="button"
              onClick={() => {
                void install();
                close();
              }}
              className={`
                flex h-10 w-full items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink
                hover:bg-surface-2
                focus-visible:outline-2 focus-visible:outline-accent
              `}
            >
              <Icon name="install" className="size-4.5 shrink-0" />
              {shell.installLire}
            </button>
          ) : null}
          <AndroidAppLink className="h-10 px-3 text-sm font-medium" />
        </div>
      </div>
    </>
  );
};
