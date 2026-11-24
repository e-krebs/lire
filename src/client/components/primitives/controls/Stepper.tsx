import { useState } from "react";
import { Icon } from "client/components/primitives/icons/icons";
import { stepStatuses, type StepStatus } from "client/utils/steps";

interface StepperStep<Id extends string> {
  id: Id;
  label: string;
}

/**
 * Controlled step list: the caller owns `current`, and only done steps are clickable. The list is
 * hidden below `sm` (a count line shows instead), so the caller must provide a back path there.
 */
interface StepperProps<Id extends string> {
  /** Accessible name of the step list. */
  label: string;
  steps: readonly StepperStep<Id>[];
  /** Id of the step in progress. */
  current: Id;
  /** Count shown below `sm` in place of the list, such as "Step 2 of 3". */
  countLabel: (count: { current: number; total: number }) => string;
  /** Hidden text read after the label of a done or a not yet reached step. */
  statusLabels: { done: string; todo: string };
  /** Completed step chosen. */
  onSelect: (id: Id) => void;
}

const segmentFillClassName: Record<StepStatus, string> = {
  done: "scale-x-100",
  current: "scale-x-100",
  todo: "scale-x-0",
};

// The line sweep (`.step-line-*` in styles.css) takes 270ms to cross. A circle fades out over that
// time and the new current one waits for the sweep to arrive.
const circleClassName: Record<StepStatus, string> = {
  done: "text-muted group-hover:text-accent-text",
  current: "font-semibold text-accent-text motion-safe:delay-270",
  todo: "text-faint",
};

const StepName = ({
  label,
  status,
  statusLabels,
}: {
  label: string | undefined;
  status: StepStatus;
  statusLabels: { done: string; todo: string };
}) => (
  <>
    <span className="sr-only">{label}</span>
    {status !== "current" && (
      <>
        {" "}
        <span className="sr-only">{statusLabels[status]}</span>
      </>
    )}
  </>
);

export const Stepper = <Id extends string>({
  label,
  steps,
  current,
  countLabel,
  statusLabels,
  onSelect,
}: StepperProps<Id>) => {
  const statuses = stepStatuses({ ids: steps.map((step) => step.id), current });
  const labels = new Map(steps.map((step) => [step.id, step.label]));
  const currentIndex = statuses.findIndex(({ status }) => status === "current");
  const [move, setMove] = useState({ index: currentIndex, from: currentIndex, count: 0 });
  if (move.index !== currentIndex) {
    setMove({ index: currentIndex, from: move.index, count: move.count + 1 });
  }
  const forward = move.index > move.from;

  return (
    <nav aria-label={label}>
      <ol className="flex items-center max-sm:hidden">
        {statuses.map(({ id, status }, index) => (
          <li
            key={id}
            className={`flex items-center text-sm ${index < steps.length - 1 ? "flex-1" : ""}`}
          >
            <div className="group relative inline-flex min-h-11 min-w-11 items-center justify-center px-2">
              <span
                className={`grid size-6 place-items-center rounded-full border border-current text-xs tabular-nums motion-safe:transition-colors motion-safe:duration-270 ${circleClassName[status]}`}
              >
                {status === "done" ? <Icon name="check" className="size-4" /> : index + 1}
              </span>
              {status === "done" ? (
                <button
                  type="button"
                  onClick={() => {
                    onSelect(id);
                  }}
                  className="absolute inset-0 rounded-full focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <StepName label={labels.get(id)} status={status} statusLabels={statusLabels} />
                </button>
              ) : (
                <span aria-current={status === "current" ? "step" : undefined}>
                  <StepName label={labels.get(id)} status={status} statusLabels={statusLabels} />
                </span>
              )}
            </div>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="mx-2 h-0.5 min-w-8 flex-1 overflow-hidden bg-hairline"
              >
                {index >= Math.min(move.from, move.index) &&
                  index < Math.max(move.from, move.index) && (
                    <span
                      key={move.count}
                      className={`block h-full bg-accent-text ${forward ? "step-line-forward" : "step-line-back"}`}
                    />
                  )}
              </span>
            )}
          </li>
        ))}
      </ol>
      <p
        key={currentIndex}
        className={`text-sm text-muted tabular-nums sm:hidden ${move.count === 0 ? "" : forward ? "step-count-forward" : "step-count-back"}`}
      >
        {countLabel({ current: currentIndex + 1, total: steps.length })}
      </p>
      <div aria-hidden="true" className="mt-2 flex gap-1 sm:hidden">
        {statuses.map(({ id, status }) => (
          <span key={id} className="h-1 flex-1 overflow-hidden rounded-full bg-hairline">
            <span
              className={`block h-full origin-left bg-accent-text motion-safe:transition-transform motion-safe:duration-300 ${segmentFillClassName[status]}`}
            />
          </span>
        ))}
      </div>
    </nav>
  );
};
