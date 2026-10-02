import { useEffect, useId, useRef, useState } from "react";
import { useCreateCollection, useFeedLookup, useSubscribe } from "client/api/queries";
import { useT } from "client/i18n/useT";
import type { Collection } from "shared/feedsApi/types";
import { CategoryPicker } from "./CategoryPicker";
import { primaryClassName } from "./CategoryPanel";
import { hostOf } from "./FeedsTab";
import { SidePanel } from "./SidePanel";

const MIN_QUERY_LENGTH = 4;
const FEED_URL_PLACEHOLDER = "https://example.test/rss";

const cancelClassName = `
  min-h-11 flex-1 rounded-xl bg-surface-2 px-4 text-sm font-semibold text-ink
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  motion-safe:transition-colors
`;

const resultRowClassName = `
  flex min-h-11 items-center gap-3 border-b border-hairline px-3 py-2 text-sm text-ink
  last:border-b-0
  has-checked:bg-accent-soft
`;

interface SubscribePanelProps {
  /** All categories, for the category picker. */
  collections: Collection[];
  /** The category the panel was opened from, ticked up front. */
  categoryId: string | undefined;
  /** Panel dismissed, or the feed was added. */
  onClose: () => void;
}

export const SubscribePanel = ({ collections, categoryId, onClose }: SubscribePanelProps) => {
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
    categoryId !== undefined && collections.some((collection) => collection.id === categoryId)
      ? [categoryId]
      : [],
  );
  const lookup = useFeedLookup(debouncedQuery);
  const subscribe = useSubscribe();
  const createCollection = useCreateCollection();

  // Debounces the lookup against a timer, the standard "wait for typing to settle" Effect.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(urlInput);
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [urlInput]);

  const results = lookup.data?.results ?? [];
  // A single result is the obvious pick, so it needs no extra tap.
  const chosen =
    results.find((result) => result.feedId === chosenId) ??
    (results.length === 1 ? results[0] : undefined);
  const canSubscribe = chosen !== undefined && selected.length > 0 && !subscribe.isPending;

  const urlError = tooShort
    ? t.subscriptions.enterUrl
    : lookup.isError
      ? t.subscriptions.lookupFailed({ message: lookup.error.message })
      : null;
  const submitError = subscribe.isError
    ? t.subscriptions.subscribeFeedFailed({ message: subscribe.error.message })
    : createCollection.isError
      ? t.subscriptions.createCategoryFailed({ message: createCollection.error.message })
      : null;

  const handleSubmit = (): void => {
    if (urlInput.trim().length < MIN_QUERY_LENGTH) {
      setTooShort(true);
      inputRef.current?.focus();
      return;
    }
    // Before the debounce settles, submit looks the URL up now instead of subscribing.
    if (debouncedQuery !== urlInput) {
      setDebouncedQuery(urlInput);
      return;
    }
    if (!canSubscribe) return;
    subscribe.mutate(
      { feedId: chosen.feedId, title: chosen.title, categoryIds: selected },
      { onSuccess: onClose },
    );
  };

  const resultCount =
    lookup.isFetching || debouncedQuery.trim().length < MIN_QUERY_LENGTH
      ? ""
      : t.subscriptions.resultCount({ count: results.length });

  return (
    <SidePanel
      open
      onClose={onClose}
      title={t.subscriptions.addFeedTitle}
      subtitle={chosen === undefined ? t.subscriptions.feedStep1 : t.subscriptions.feedStep2}
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
              {lookup.isFetching ? t.subscriptions.searching : resultCount}
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
                const host = hostOf(result.website);
                return (
                  <label key={result.feedId} className={resultRowClassName}>
                    <input
                      type="radio"
                      name={resultsName}
                      checked={chosen?.feedId === result.feedId}
                      onChange={() => {
                        setChosenId(result.feedId);
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
                          data-tip={result.website}
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
        </div>
        <CategoryPicker
          categories={collections}
          selected={selected}
          onChange={setSelected}
          mode="multiple"
          onCreate={(label) => {
            createCollection.mutate(label, {
              onSuccess: (collection) => {
                setSelected((current) => [...current, collection.id]);
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
