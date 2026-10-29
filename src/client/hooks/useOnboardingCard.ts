import { useState } from "react";
import { useOnboarding, useUpdateOnboarding } from "client/api/queries";
import type { OnboardingStepId as CardStepId } from "client/components/app/onboarding/OnboardingCard";
import type { OnboardingPatch, OnboardingStepId } from "shared/feedsApi/types";
import { isInstalledApp, useInstallPrompt } from "client/utils/installPrompt";
import type { SubscriptionsSearch } from "client/utils/subscriptionsSearch";

const storedSteps = [
  "language",
  "addFeed",
  "newsletter",
  "folders",
  "categories",
  "markAsRead",
  "originalSite",
] as const satisfies readonly OnboardingStepId[];

// The rows that are links to Subscriptions, with the panel each one opens. The rest are buttons.
const linkSearch: Partial<Record<CardStepId, SubscriptionsSearch>> = {
  addFeed: { add: true },
  newsletter: { newsletter: true },
  folders: { tab: "categories" },
};

export const useOnboardingCard = () => {
  const onboarding = useOnboarding();
  const update = useUpdateOnboarding();
  const [dismissing, setDismissing] = useState(false);
  const dismissed = onboarding.data?.dismissed;
  const [seenDismissed, setSeenDismissed] = useState(dismissed);
  // The card lives in the route's instance of this hook, so a restore from the menu's instance
  // must reach it here, or the card comes back in its flight.
  if (dismissed !== seenDismissed) {
    setSeenDismissed(dismissed);
    if (dismissed === false) setDismissing(false);
  }
  const installPrompt = useInstallPrompt();
  const installed =
    (typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      isInstalledApp()) ||
    installPrompt.installed;

  // The install row stays once offered, so clicking it does not remove it. It is ticked on its own.
  const steps = onboarding.data
    ? [
        ...storedSteps.map((id) => ({
          id,
          done: onboarding.data.done[id] === true,
          auto: false,
          search: linkSearch[id],
        })),
        ...(installPrompt.offered || installed
          ? [
              {
                id: "install" as const,
                done: installed,
                auto: true,
                canInstall: installPrompt.canInstall,
              },
            ]
          : []),
      ]
    : [];

  const toggleStep = ({ id, done }: { id: CardStepId; done: boolean }): void => {
    if (id === "install") return;
    const donePatch: OnboardingPatch["done"] = { [id]: done };
    update.mutate({ done: donePatch });
  };

  const completed = steps.length > 0 && steps.every((step) => step.done);

  const setDismissed = (dismissed: boolean): void => {
    update.mutate({ dismissed });
  };

  // Only the button rows reach here. Acting never ticks a step: the reader ticks it.
  const onAction = (id: CardStepId): void => {
    if (id === "install") {
      void installPrompt.install();
    } else if (id === "language") {
      window.dispatchEvent(new Event("lire:focus-language-select"));
    } else if (id === "categories") {
      window.dispatchEvent(new Event("lire:open-navigator"));
    }
  };

  // Focus leaves the card before it turns inert, so it is not left on a dead node.
  const onDismissStart = (): void => {
    document.getElementById("account-menu-trigger")?.focus();
    setDismissing(true);
  };

  // A failed save rolls the cache back to shown, so the card must turn live again too.
  const onDismiss = (): void => {
    update.mutate(
      { dismissed: true },
      {
        onError: () => {
          setDismissing(false);
        },
      },
    );
  };

  return {
    state: onboarding.data,
    steps,
    completed,
    dismissing,
    onDismissStart,
    toggleCollapse: () => {
      update.mutate({ collapsed: !onboarding.data?.collapsed });
    },
    toggleStep,
    setDismissed,
    onAction,
    onDismiss,
  };
};
