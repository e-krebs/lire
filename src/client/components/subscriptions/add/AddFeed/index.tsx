import {
  primaryClassName,
  secondaryClassName,
} from "client/components/primitives/controls/buttonClassNames";
import { Stepper } from "client/components/primitives/controls/Stepper";
import { StepPanel } from "client/components/primitives/controls/StepPanel";
import { useT } from "client/i18n/useT";
import type { Category } from "shared/feedsApi/types";
import { CategoriesStep } from "./CategoriesStep";
import { FindStep } from "./FindStep";
import { FeedNameStep, WebFeedNameStep } from "./NameStep";
import { STEP_IDS, headingClassName, stepFormId, type StepId } from "./shared";
import { useAddFeedFlow } from "./useAddFeedFlow";

interface AddFeedProps {
  /** All categories, for the category picker. */
  categories: Category[];
  /** The category the flow was opened from, ticked up front. */
  categoryId: string | undefined;
  step: StepId;
  /** A step to show: pushed to history, or `replace`d when the guard corrects it. */
  onStepChange: (change: { step: StepId; replace?: boolean }) => void;
  /** The feed was added. */
  onDone: () => void;
  /** Cancelled on the first step. */
  onCancel: () => void;
}

export const AddFeed = ({
  categories,
  categoryId,
  step,
  onStepChange,
  onDone,
  onCancel,
}: AddFeedProps) => {
  const { subscriptions: t, common } = useT();
  const flow = useAddFeedFlow({ categories, categoryId, step, onStepChange, onDone });
  const { picked, shownStep, stepIndex, errors, headingRef } = flow;

  const stepLabels: Record<StepId, string> = {
    find: t.stepFind,
    name: t.stepName,
    categories: t.stepCategories,
  };
  const previous = stepIndex === 0 ? undefined : STEP_IDS.at(stepIndex - 1);
  const last = shownStep === "categories";
  const pickedLabel = picked?.kind === "feed" ? picked.title : picked?.pageUrl;

  return (
    <div className="flex min-h-full flex-col gap-6 p-4 sm:mx-auto sm:max-w-120 sm:py-8 lg:max-w-4xl">
      <h1 className="text-sm font-semibold text-muted">{t.addFeedTitle}</h1>
      <Stepper
        label={t.addSteps}
        steps={STEP_IDS.map((id) => ({ id, label: stepLabels[id] }))}
        current={shownStep}
        countLabel={t.stepCount}
        statusLabels={{ done: t.stepDone, todo: t.stepTodo }}
        onSelect={(id) => {
          onStepChange({ step: id });
        }}
      />
      <div className="flex flex-1 flex-col gap-6 lg:grid lg:flex-none lg:grid-cols-[340px_1fr] lg:gap-8">
        {picked === undefined || shownStep === "find" ? null : (
          <p
            data-tip={pickedLabel}
            data-tip-overflow=""
            className="truncate text-sm text-muted max-lg:hidden"
          >
            {pickedLabel}
          </p>
        )}
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <StepPanel index={stepIndex} className="flex flex-col gap-4">
            <h2 ref={headingRef} tabIndex={-1} className={headingClassName}>
              {stepLabels[shownStep]}
            </h2>
            {shownStep === "find" ? (
              <FindStep
                urlInput={flow.urlInput}
                onUrlChange={flow.changeUrl}
                picked={picked}
                onPickFeed={flow.pickFeed}
                onMakeWebFeed={flow.makeWebFeed}
                pickError={errors.url}
                onSubmit={flow.goNext}
              />
            ) : shownStep === "name" && picked?.kind === "feed" ? (
              <FeedNameStep
                picked={picked}
                name={flow.name}
                onNameChange={flow.setTypedName}
                nameError={errors.name}
                onSubmit={flow.goNext}
              />
            ) : shownStep === "name" && picked?.kind === "web" ? (
              <WebFeedNameStep
                name={flow.name}
                onNameChange={flow.setTypedName}
                nameError={errors.name}
                onSubmit={flow.goNext}
                {...flow.web}
                variantError={errors.variant}
                onSelect={flow.setVariantIndex}
                onRetry={flow.retryAnalysis}
              />
            ) : (
              <CategoriesStep
                categories={categories}
                selected={flow.selected}
                onChange={flow.setSelected}
                error={flow.submitError}
                pickError={errors.categories}
                onSubmit={flow.submit}
              />
            )}
          </StepPanel>
          <div
            className={`
              mt-4 flex gap-3 border-t border-hairline pt-4
              max-sm:sticky max-sm:bottom-0 max-sm:bg-surface max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]
              sm:justify-end
            `}
          >
            <button
              type="button"
              onClick={() => {
                if (previous === undefined) onCancel();
                else onStepChange({ step: previous });
              }}
              className={`${secondaryClassName} flex-1 sm:w-40 sm:flex-none`}
            >
              {previous === undefined ? common.cancel : t.previous}
            </button>
            <button
              type="submit"
              form={stepFormId(shownStep)}
              disabled={last && flow.pending}
              className={`${primaryClassName} sm:w-40 sm:flex-none`}
            >
              {last ? t.subscribe : t.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
