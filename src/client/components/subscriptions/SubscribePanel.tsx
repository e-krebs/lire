import { useEffect, useId, useRef, useState } from "react";
import {
  isPremiumRequired,
  useAnalyzeWebFeed,
  useCreateCategory,
  useCreateWebFeed,
  useFeedLookup,
  useSubscribe,
  useWebFeedStatus,
} from "client/api/queries";
import { useT } from "client/i18n/useT";
import type { Category } from "shared/feedsApi/types";
import { CategoryPicker } from "./CategoryPicker";
import { primaryClassName } from "./CategoryPanel";
import { hostOf } from "./FeedsTab";
import { SidePanel } from "./SidePanel";
import { WebFeedVariants } from "./WebFeedVariants";

const MIN_QUERY_LENGTH = 4;
const FEED_URL_PLACEHOLDER = "https://example.test/rss";

const cancelClassName = `
  min-h-11 flex-1 rounded-xl bg-surface-2 px-4 text-sm font-semibold text-ink
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  motion-safe:transition-colors
`;

const webFeedLinkClassName = `
  min-h-11 self-start rounded-xl px-3 text-sm font-medium text-accent-text
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
`;

const isPageUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const resultRowClassName = `
  flex min-h-11 items-center gap-3 border-b border-hairline px-3 py-2 text-sm text-ink
  last:border-b-0
  has-checked:bg-accent-soft
`;

interface SubscribePanelProps {
  /** All categories, for the category picker. */
  categories: Category[];
  /** The category the panel was opened from, ticked up front. */
  categoryId: string | undefined;
  /** Panel dismissed, or the feed was added. */
  onClose: () => void;
}

export const SubscribePanel = ({ categories, categoryId, onClose }: SubscribePanelProps) => {
  const t = useT();
  const formId = useId();
  const urlId = useId();
  const errorId = useId();
  const resultsName = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const [chosenId, setChosenId] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState(
    categoryId !== undefined && categories.some((category) => category.id === categoryId)
      ? [categoryId]
      : [],
  );
  const [variantIndex, setVariantIndex] = useState<number | undefined>(undefined);
  const lookup = useFeedLookup(debouncedQuery);
  const subscribe = useSubscribe();
  const analyze = useAnalyzeWebFeed();
  const createWebFeed = useCreateWebFeed();
  const createCategory = useCreateCategory();

  // Debounces the lookup against a timer, the standard "wait for typing to settle" Effect.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(urlInput);
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [urlInput]);

  const pageUrl = urlInput.trim();
  const analysisUrl = analyze.variables?.url;
  const requestId = analyze.data?.requestId;
  // Analyze answers a bare feed address when the URL is already a feed.
  const directFeedUrl = analyze.data?.requestId === undefined ? analyze.data?.feedUrl : undefined;
  const webFeedStep = analyze.isPending || analyze.isError || analyze.data !== undefined;
  const webStatus = useWebFeedStatus({ requestId });
  const variants = webStatus.data?.status === "done" ? webStatus.data.variants : undefined;
  const pickedIndex = variantIndex ?? (variants?.length === 1 ? 0 : undefined);
  const pickedVariant = pickedIndex === undefined ? undefined : variants?.[pickedIndex];

  const results = webFeedStep ? [] : (lookup.data ?? []);
  const lookupSettled = lookup.isSuccess && !lookup.isFetching && debouncedQuery === urlInput;
  const canMakeWebFeed = !webFeedStep && isPageUrl(pageUrl) && lookupSettled;

  const startAnalysis = (): void => {
    setVariantIndex(undefined);
    analyze.mutate({ url: pageUrl });
  };
  // A single result is the obvious pick, so it needs no extra tap.
  const chosen =
    results.find((result) => result.feedUrl === chosenId) ??
    (results.length === 1 ? results[0] : undefined);
  const canSubscribe =
    selected.length > 0 &&
    (webFeedStep
      ? (pickedVariant !== undefined || directFeedUrl !== undefined) &&
        !subscribe.isPending &&
        !createWebFeed.isPending
      : chosen !== undefined && !subscribe.isPending);

  const urlError = tooShort
    ? t.subscriptions.enterUrl
    : lookup.isError
      ? t.subscriptions.lookupFailed({ message: lookup.error.message })
      : null;
  const submitError = createWebFeed.isError
    ? isPremiumRequired(createWebFeed.error)
      ? t.subscriptions.webFeedPremium
      : t.subscriptions.subscribeFeedFailed({ message: createWebFeed.error.message })
    : subscribe.isError
      ? t.subscriptions.subscribeFeedFailed({ message: subscribe.error.message })
      : createCategory.isError
        ? t.subscriptions.createCategoryFailed({ message: createCategory.error.message })
        : null;

  const handleSubmit = (): void => {
    if (urlInput.trim().length < MIN_QUERY_LENGTH) {
      setTooShort(true);
      inputRef.current?.focus();
      return;
    }
    // Before the debounce settles, submit looks the URL up now instead of subscribing.
    if (!webFeedStep && debouncedQuery !== urlInput) {
      setDebouncedQuery(urlInput);
      return;
    }
    if (!canSubscribe) return;
    if (webFeedStep) {
      if (directFeedUrl !== undefined) {
        subscribe.mutate(
          {
            feedUrl: directFeedUrl,
            title: hostOf(directFeedUrl) ?? directFeedUrl,
            categoryIds: selected,
          },
          { onSuccess: onClose },
        );
      } else if (pickedVariant !== undefined && pickedIndex !== undefined && analysisUrl) {
        createWebFeed.mutate(
          {
            url: analysisUrl,
            variantIndex: pickedIndex,
            fields: pickedVariant.fields,
            htmlHash: webStatus.data?.htmlHash,
            title: webStatus.data?.pageTitle,
            categoryIds: selected,
          },
          { onSuccess: onClose },
        );
      }
      return;
    }
    if (chosen === undefined) return;
    subscribe.mutate(
      { feedUrl: chosen.feedUrl, title: chosen.title, categoryIds: selected },
      { onSuccess: onClose },
    );
  };

  const resultCount =
    webFeedStep || lookup.isFetching || debouncedQuery.trim().length < MIN_QUERY_LENGTH
      ? ""
      : t.subscriptions.resultCount({ count: results.length });

  return (
    <SidePanel
      open
      onClose={onClose}
      title={t.subscriptions.addFeedTitle}
      subtitle={
        chosen === undefined && pickedVariant === undefined && directFeedUrl === undefined
          ? t.subscriptions.feedStep1
          : t.subscriptions.feedStep2
      }
      actions={
        <>
          <button type="button" onClick={onClose} className={cancelClassName}>
            {t.common.cancel}
          </button>
          <button type="submit" form={formId} disabled={!canSubscribe} className={primaryClassName}>
            {t.subscriptions.subscribe}
          </button>
        </>
      }
    >
      <form
        id={formId}
        // The lookup also takes a bare site name, which native `type="url"` validation would block.
        noValidate
        className="flex flex-col gap-4 px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={urlId} className="text-xs font-semibold text-muted">
              {t.subscriptions.feedUrlLabel}
            </label>
            <span role="status" className="text-xs text-faint tabular-nums">
              {lookup.isFetching && !webFeedStep ? t.subscriptions.searching : resultCount}
            </span>
          </div>
          <input
            ref={inputRef}
            id={urlId}
            type="url"
            inputMode="url"
            autoComplete="off"
            enterKeyHint="search"
            placeholder={FEED_URL_PLACEHOLDER}
            value={urlInput}
            aria-invalid={urlError !== null || undefined}
            aria-describedby={urlError === null ? undefined : errorId}
            onChange={(event) => {
              setUrlInput(event.target.value);
              setTooShort(false);
              analyze.reset();
              createWebFeed.reset();
              setVariantIndex(undefined);
            }}
            className={`
              min-h-11 w-full rounded-xl bg-surface px-3 text-sm text-ink ring-1 ring-hairline
              ring-inset
              focus-visible:outline-2 focus-visible:outline-accent
              aria-invalid:ring-danger
            `}
          />
          {urlError === null ? null : (
            <p id={errorId} role="alert" className="text-sm text-danger">
              {urlError}
            </p>
          )}
          {results.length === 0 ? null : (
            <fieldset className="overflow-hidden rounded-xl ring-1 ring-hairline ring-inset">
              <legend className="sr-only">{t.subscriptions.results}</legend>
              {results.map((result) => {
                const host = hostOf(result.feedUrl);
                return (
                  <label key={result.feedUrl} className={resultRowClassName}>
                    <input
                      type="radio"
                      name={resultsName}
                      checked={chosen?.feedUrl === result.feedUrl}
                      onChange={() => {
                        setChosenId(result.feedUrl);
                      }}
                      className={`
                        size-5 flex-none accent-accent
                        focus-visible:outline-2 focus-visible:outline-accent
                      `}
                    />
                    <span className="min-w-0 flex-1">
                      <span data-tip={result.title} data-tip-overflow="" className="block truncate">
                        {result.title}
                      </span>
                      {host === undefined ? null : (
                        <span
                          data-tip={result.feedUrl}
                          data-tip-overflow=""
                          className="block truncate text-xs text-faint"
                        >
                          {host}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
          {canMakeWebFeed && results.length === 0 ? (
            <>
              <p className="text-xs text-faint">{t.subscriptions.noFeedFound}</p>
              <button type="button" onClick={startAnalysis} className={primaryClassName}>
                {t.subscriptions.makeWebFeed}
              </button>
            </>
          ) : null}
          {canMakeWebFeed && results.length > 0 ? (
            <button type="button" onClick={startAnalysis} className={webFeedLinkClassName}>
              {t.subscriptions.makeWebFeedInstead}
            </button>
          ) : null}
          {directFeedUrl === undefined ? null : (
            <p role="status" className="text-xs text-faint">
              {t.subscriptions.alreadyFeed}
            </p>
          )}
          {webFeedStep && directFeedUrl === undefined ? (
            <WebFeedVariants
              status={webStatus.data}
              failed={analyze.isError || webStatus.isError}
              timedOut={webStatus.timedOut}
              selected={pickedIndex}
              onSelect={setVariantIndex}
              onRetry={startAnalysis}
            />
          ) : null}
        </div>
        <CategoryPicker
          categories={categories}
          selected={selected}
          onChange={setSelected}
          mode="multiple"
          onCreate={(label) => {
            createCategory.mutate(label, {
              onSuccess: (created) => {
                setSelected((current) => [...current, created.id]);
              },
            });
          }}
        />
        {selected.length === 0 ? (
          <p className="text-xs text-faint">{t.subscriptions.pickCategory}</p>
        ) : null}
        {submitError === null ? null : (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        )}
      </form>
    </SidePanel>
  );
};
