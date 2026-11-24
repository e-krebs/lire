import { useEffect, useState } from "react";
import {
  isPremiumRequired,
  useAnalyzeWebFeed,
  useCreateWebFeed,
  useSubscribe,
  useWebFeedStatus,
} from "client/api/queries";
import { useStepFocus } from "client/hooks/useStepFocus";
import { useT } from "client/i18n/useT";
import { hostOf } from "client/utils/hostOf";
import { furthestStep } from "client/utils/steps";
import type { Category } from "shared/feedsApi/types";
import { STEP_IDS, type Picked, type StepId } from "./shared";

interface UseAddFeedFlowParams {
  categories: Category[];
  categoryId: string | undefined;
  step: StepId;
  onStepChange: (change: { step: StepId; replace?: boolean }) => void;
  onDone: () => void;
}

export const useAddFeedFlow = ({
  categories,
  categoryId,
  step,
  onStepChange,
  onDone,
}: UseAddFeedFlowParams) => {
  const t = useT().subscriptions;
  const [urlInput, setUrlInput] = useState("");
  const [picked, setPicked] = useState<Picked>();
  // Until the user types, the name follows the picked feed.
  const [typedName, setTypedName] = useState<string>();
  const [selected, setSelected] = useState(
    categoryId !== undefined && categories.some((category) => category.id === categoryId)
      ? [categoryId]
      : [],
  );
  const [variantIndex, setVariantIndex] = useState<number>();
  // The step whose Next was pressed while incomplete: its errors show until the user moves on.
  const [attempted, setAttempted] = useState<StepId>();
  const subscribe = useSubscribe();
  const analyze = useAnalyzeWebFeed();
  const createWebFeed = useCreateWebFeed();
  const webStatus = useWebFeedStatus({ requestId: analyze.data?.requestId });

  const pageUrl = picked?.kind === "web" ? picked.pageUrl : undefined;
  // Analyze answers a bare feed address when the URL is already a feed.
  const directFeedUrl = analyze.data?.requestId === undefined ? analyze.data?.feedUrl : undefined;
  const variants = webStatus.data?.status === "done" ? webStatus.data.variants : undefined;
  const pickedIndex = variantIndex ?? (variants?.length === 1 ? 0 : undefined);
  const pickedVariant = pickedIndex === undefined ? undefined : variants?.[pickedIndex];

  const defaultName =
    picked === undefined
      ? ""
      : picked.kind === "feed"
        ? picked.title
        : (hostOf(directFeedUrl) ?? webStatus.data?.pageTitle ?? hostOf(picked.pageUrl) ?? "");
  const name = typedName ?? defaultName;
  const webReady =
    pageUrl === undefined || pickedVariant !== undefined || directFeedUrl !== undefined;

  const complete = (id: StepId): boolean =>
    id === "find"
      ? picked !== undefined
      : id === "name"
        ? name.trim() !== "" && webReady
        : selected.length > 0;
  const furthest = furthestStep({ ids: STEP_IDS, complete }) ?? "find";
  const shownStep = STEP_IDS.indexOf(step) > STEP_IDS.indexOf(furthest) ? furthest : step;
  const stepIndex = STEP_IDS.indexOf(shownStep);
  const headingRef = useStepFocus({ step: shownStep });

  // The flow state lives here, not in the route, so the route cannot guard a deep link itself.
  useEffect(() => {
    if (shownStep !== step) onStepChange({ step: shownStep, replace: true });
  }, [shownStep, step, onStepChange]);

  const pending = subscribe.isPending || createWebFeed.isPending;
  const attemptedHere = attempted === shownStep;
  const errors = {
    url:
      attemptedHere && picked === undefined
        ? urlInput.trim() === ""
          ? t.enterUrl
          : t.pickFeedRequired
        : undefined,
    name: attemptedHere && name.trim() === "" ? t.nameRequired : undefined,
    variant:
      attemptedHere && variants !== undefined && !webReady ? t.pickVariantRequired : undefined,
    categories: attemptedHere && selected.length === 0 ? t.pickCategory : undefined,
  };

  const submitError = createWebFeed.isError
    ? isPremiumRequired(createWebFeed.error)
      ? t.webFeedPremium
      : t.subscribeFeedFailed({ message: createWebFeed.error.message })
    : subscribe.isError
      ? t.subscribeFeedFailed({ message: subscribe.error.message })
      : null;

  const resetPick = (): void => {
    setPicked(undefined);
    setTypedName(undefined);
    setVariantIndex(undefined);
    analyze.reset();
    createWebFeed.reset();
  };

  const changeUrl = (value: string): void => {
    setUrlInput(value);
    resetPick();
  };

  const pickFeed = (feed: { feedUrl: string; title: string }): void => {
    resetPick();
    setPicked({ kind: "feed", ...feed });
  };

  const analyzePage = ({ url }: { url: string }): void => {
    setVariantIndex(undefined);
    analyze.mutate({ url });
  };

  const makeWebFeed = ({ pageUrl: url }: { pageUrl: string }): void => {
    resetPick();
    setPicked({ kind: "web", pageUrl: url });
    analyzePage({ url });
    onStepChange({ step: "name" });
  };

  const retryAnalysis = (): void => {
    if (pageUrl !== undefined) analyzePage({ url: pageUrl });
  };

  /** False when the step is incomplete: its errors show and the caller focuses the field. */
  const goNext = (): boolean => {
    if (!complete(shownStep)) {
      setAttempted(shownStep);
      return false;
    }
    const next = STEP_IDS.at(stepIndex + 1);
    if (next !== undefined) onStepChange({ step: next });
    return true;
  };

  /** False when a step is incomplete, as for `goNext`. */
  const submit = (): boolean => {
    if (!STEP_IDS.every(complete) || picked === undefined) {
      setAttempted(shownStep);
      return false;
    }
    if (pending) return true;
    const title = name.trim();
    const feedUrl = picked.kind === "feed" ? picked.feedUrl : directFeedUrl;
    if (feedUrl !== undefined) {
      subscribe.mutate({ feedUrl, title, categoryIds: selected }, { onSuccess: onDone });
    } else if (picked.kind === "web" && pickedVariant !== undefined && pickedIndex !== undefined) {
      createWebFeed.mutate(
        {
          url: picked.pageUrl,
          variantIndex: pickedIndex,
          fields: pickedVariant.fields,
          htmlHash: webStatus.data?.htmlHash,
          title,
          categoryIds: selected,
        },
        { onSuccess: onDone },
      );
    }
    return true;
  };

  return {
    urlInput,
    picked,
    name,
    selected,
    shownStep,
    stepIndex,
    headingRef,
    pending,
    errors,
    submitError,
    web: {
      status: webStatus.data,
      failed: analyze.isError || webStatus.isError,
      timedOut: webStatus.timedOut,
      directFeedUrl,
      selected: pickedIndex,
    },
    setTypedName,
    setSelected,
    setVariantIndex,
    changeUrl,
    pickFeed,
    makeWebFeed,
    retryAnalysis,
    goNext,
    submit,
  };
};
