import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { useT } from "client/i18n/useT";
import type { SubscriptionsSearch } from "client/utils/subscriptionsSearch";
import { MarkAsReadHowTo } from "client/components/app/onboarding/MarkAsReadHowTo";
import { OriginalSiteHowTo } from "client/components/app/onboarding/OriginalSiteHowTo";

export type OnboardingStepId =
  | "language"
  | "addFeed"
  | "newsletter"
  | "folders"
  | "categories"
  | "markAsRead"
  | "originalSite"
  | "install";

// The rows whose "See how" button opens a how-to dialog.
type HowId = "markAsRead" | "originalSite";

const isHowId = (id: OnboardingStepId): id is HowId => id === "markAsRead" || id === "originalSite";

interface OnboardingStep {
  id: OnboardingStepId;
  done: boolean;
  auto: boolean;
  // Set on the rows whose action is a link to Subscriptions, with the panel it opens.
  search?: SubscriptionsSearch | undefined;
  // Set on the install row: true while the browser can still show its prompt.
  canInstall?: boolean;
}

interface OnboardingCardProps {
  steps: OnboardingStep[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggleStep: ({ id, done }: { id: OnboardingStepId; done: boolean }) => void;
  onAction: (id: OnboardingStepId) => void;
  // Owned by the parent: the card can remount mid-flight, and the new instance must keep flying.
  dismissing: boolean;
  onDismissStart: () => void;
  onDismiss: () => void;
}

// The length of the `toast-absorb-move` animation in `.card-absorb`.
const FLIGHT_MS = 280;
// Past the move's animationend, so the card is still mounted for it to fire.
const DISMISS_AFTER_MS = FLIGHT_MS + 50;

interface Flight {
  height: number;
  style: CSSProperties & { "--absorb-x": string; "--absorb-y": string };
}

const centre = (rect: DOMRect): { x: number; y: number } => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

const measureFlight = (card: HTMLElement): Flight => {
  const rect = card.getBoundingClientRect();
  const from = centre(rect);
  const cog = document.getElementById("account-menu-trigger");
  const to = cog ? centre(cog.getBoundingClientRect()) : from;
  return {
    height: rect.height,
    // Fixed at the measured rect and portaled to body: no pane or transformed ancestor clips it.
    style: {
      position: "fixed",
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      zIndex: 60,
      "--absorb-x": `${to.x - from.x}px`,
      "--absorb-y": `${to.y - from.y}px`,
    },
  };
};

const actionClassName =
  "ml-10 inline-flex min-h-11 flex-none items-center rounded-md px-2 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-accent";

const iconButtonClassName =
  "inline-flex size-11 flex-none items-center justify-center rounded-md text-muted motion-safe:transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent";

interface OnboardingPanelProps extends OnboardingCardProps {
  cardRef: RefObject<HTMLElement | null>;
  flight: Flight | null;
  dismiss: () => void;
}

const OnboardingPanel = ({
  steps,
  collapsed,
  onToggleCollapse,
  onToggleStep,
  onAction,
  dismissing,
  dismiss,
  cardRef,
  flight,
}: OnboardingPanelProps) => {
  const { onboarding } = useT();
  const rowsId = useId();
  const [howOpen, setHowOpen] = useState<HowId | null>(null);
  const howReturnRef = useRef<HTMLElement | null>(null);
  const done = steps.filter((step) => step.done).length;
  const total = steps.length;
  const complete = total > 0 && done === total;

  return (
    <section
      ref={cardRef}
      aria-labelledby={`${rowsId}-title`}
      inert={dismissing}
      className={`rounded-xl bg-card p-4 shadow-sm ${flight ? "card-absorb" : ""} ${dismissing ? "pointer-events-none" : ""}`}
      style={flight?.style}
    >
      <header className="flex items-start gap-2">
        <h2 id={`${rowsId}-title`} className="flex-1 pt-2 text-[1.0625rem] font-bold text-balance">
          {onboarding.title}
        </h2>
        <button
          type="button"
          aria-label={collapsed ? onboarding.expand : onboarding.collapse}
          aria-controls={rowsId}
          aria-expanded={!collapsed}
          className={iconButtonClassName}
          onClick={onToggleCollapse}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`size-5 fill-none stroke-current stroke-2 motion-safe:transition-transform ${collapsed ? "-rotate-90" : ""}`}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={onboarding.dismiss}
          className={iconButtonClassName}
          onClick={dismiss}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5 fill-none stroke-current stroke-2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      <p className="mt-1 mb-2 text-sm text-muted tabular-nums">
        {onboarding.progress({ done, total })}
      </p>
      <div
        role="progressbar"
        aria-label={onboarding.progressLabel}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <span
          className="block h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
        />
      </div>

      <ol id={rowsId} hidden={collapsed} className="mt-3 list-none p-0">
        {steps.map((step) => {
          const copy = onboarding.rows[step.id];
          const howId = isHowId(step.id) ? step.id : undefined;
          return (
            <li
              key={step.id}
              data-done={step.done}
              data-auto={step.auto}
              className="group flex flex-wrap items-center gap-1 border-t border-hairline first:border-t-0"
            >
              <label className="relative flex min-w-0 flex-[1_1_100%] items-start gap-3 rounded-md px-2 py-3">
                <input
                  type="checkbox"
                  checked={step.done}
                  disabled={step.auto}
                  aria-label={copy.label}
                  className="peer sr-only"
                  onChange={(event) => {
                    onToggleStep({ id: step.id, done: event.currentTarget.checked });
                  }}
                />
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex size-5 flex-none items-center justify-center rounded-md border-2 border-muted text-on-accent peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent motion-safe:transition-colors peer-checked:[&>svg]:opacity-100"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4 fill-none stroke-current stroke-2 opacity-0"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[0.9375rem] font-semibold wrap-break-word group-data-[done=true]:text-muted">
                    {copy.label}
                  </span>
                  <span className="text-[0.8125rem] wrap-break-word text-muted">{copy.hint}</span>
                </span>
              </label>
              {step.search !== undefined ? (
                <Link to="/subscriptions" search={step.search} className={actionClassName}>
                  {copy.action}
                </Link>
              ) : howId !== undefined ? (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  className={actionClassName}
                  onClick={(event) => {
                    howReturnRef.current = event.currentTarget;
                    setHowOpen(howId);
                  }}
                >
                  {copy.action}
                </button>
              ) : step.id === "install" && (step.done || step.canInstall !== true) ? null : (
                <button
                  type="button"
                  className={actionClassName}
                  onClick={() => {
                    onAction(step.id);
                  }}
                >
                  {copy.action}
                </button>
              )}
              {step.id === "install" && !step.done && step.canInstall !== true && (
                <p className="w-full pr-2 pb-3 pl-12 text-sm text-muted">
                  {onboarding.rows.install.menuHint}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <MarkAsReadHowTo
        open={howOpen === "markAsRead"}
        returnFocusRef={howReturnRef}
        onClose={() => {
          setHowOpen(null);
        }}
      />
      <OriginalSiteHowTo
        open={howOpen === "originalSite"}
        returnFocusRef={howReturnRef}
        onClose={() => {
          setHowOpen(null);
        }}
      />

      {complete && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{onboarding.allSet}</p>
          <button
            type="button"
            className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent active:scale-[0.97] motion-safe:transition-transform"
            onClick={dismiss}
          >
            {onboarding.close}
          </button>
        </div>
      )}
    </section>
  );
};

export const OnboardingCard = (props: OnboardingCardProps) => {
  const { dismissing, onDismissStart, onDismiss } = props;
  const cardRef = useRef<HTMLElement>(null);
  // Null until the card starts leaving. Measured where the card is now, so a remount mid-flight
  // flies from its new slot without a live frame.
  const [flight, setFlight] = useState<Flight | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    // Cleared too, so a dismiss the save rolled back, or a restore, leaves no flight behind.
    setFlight(dismissing ? measureFlight(card) : null);
  }, [dismissing]);

  const dismiss = (): void => {
    if (dismissing || !cardRef.current) return;
    onDismissStart();
    // A timer, not the animation's end: the card may unmount mid-flight and take its animationend with it.
    window.setTimeout(onDismiss, DISMISS_AFTER_MS);
  };

  const panel = { ...props, cardRef, dismiss, flight };
  if (!flight) return <OnboardingPanel {...panel} />;
  // The slot keeps the card's height, so the grid and the aside do not jump while it is out.
  return (
    <>
      <div aria-hidden="true" style={{ height: flight.height }} />
      {createPortal(<OnboardingPanel {...panel} />, document.body)}
    </>
  );
};
