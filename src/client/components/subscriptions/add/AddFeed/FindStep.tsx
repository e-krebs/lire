import { useEffect, useId, useRef, useState } from "react";
import { useFeedLookup } from "client/api/queries";
import { primaryClassName } from "client/components/primitives/controls/buttonClassNames";
import { useT } from "client/i18n/useT";
import { hostOf } from "client/utils/hostOf";
import { inputClassName, stepFormId, type Picked } from "./shared";

const MIN_QUERY_LENGTH = 4;
const FEED_URL_PLACEHOLDER = "https://example.test/rss";

const webFeedLinkClassName = `
  min-h-11 self-start rounded-xl px-3 text-sm font-medium text-accent-text
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
`;

const resultRowClassName = `
  flex min-h-11 items-center gap-3 border-b border-hairline px-3 py-2 text-sm text-ink
  last:border-b-0
  has-checked:bg-accent-soft
`;

const isPageUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

interface FindStepProps {
  urlInput: string;
  onUrlChange: (value: string) => void;
  picked: Picked | undefined;
  onPickFeed: (feed: { feedUrl: string; title: string }) => void;
  onMakeWebFeed: (page: { pageUrl: string }) => void;
  /** Why nothing is picked yet, once Next was pressed. */
  pickError: string | undefined;
  /** Enter or Next pressed; false when the step is incomplete. */
  onSubmit: () => boolean;
}

export const FindStep = ({
  urlInput,
  onUrlChange,
  picked,
  onPickFeed,
  onMakeWebFeed,
  pickError,
  onSubmit,
}: FindStepProps) => {
  const t = useT().subscriptions;
  const urlId = useId();
  const errorId = useId();
  const resultsName = useId();
  const urlRef = useRef<HTMLInputElement>(null);
  const [debouncedQuery, setDebouncedQuery] = useState(urlInput);
  const lookup = useFeedLookup(debouncedQuery);

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
  const results = lookup.data ?? [];
  const lookupSettled = lookup.isSuccess && !lookup.isFetching && debouncedQuery === urlInput;
  const canMakeWebFeed = isPageUrl(pageUrl) && lookupSettled;
  const urlError = lookup.isError
    ? t.lookupFailed({ message: lookup.error.message })
    : (pickError ?? null);
  const resultCount =
    lookup.isFetching || debouncedQuery.trim().length < MIN_QUERY_LENGTH
      ? ""
      : t.resultCount({ count: results.length });

  return (
    <form
      id={stepFormId("find")}
      // The lookup also takes a bare site name, which native `type="url"` validation would block.
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!onSubmit()) urlRef.current?.focus();
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={urlId} className="text-xs font-semibold text-muted">
          {t.feedUrlLabel}
        </label>
        <span role="status" className="text-xs text-faint tabular-nums">
          {lookup.isFetching ? t.searching : resultCount}
        </span>
      </div>
      <input
        ref={urlRef}
        id={urlId}
        type="url"
        inputMode="url"
        autoComplete="off"
        enterKeyHint="next"
        placeholder={FEED_URL_PLACEHOLDER}
        value={urlInput}
        aria-invalid={urlError !== null || undefined}
        aria-describedby={urlError === null ? undefined : errorId}
        onChange={(event) => {
          onUrlChange(event.target.value);
        }}
        className={`${inputClassName} aria-invalid:ring-danger`}
      />
      {urlError === null ? null : (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {urlError}
        </p>
      )}
      {results.length === 0 ? null : (
        <fieldset className="overflow-hidden rounded-xl ring-1 ring-hairline ring-inset">
          <legend className="sr-only">{t.results}</legend>
          {results.map((result) => {
            const host = hostOf(result.feedUrl);
            return (
              <label key={result.feedUrl} className={resultRowClassName}>
                <input
                  type="radio"
                  name={resultsName}
                  checked={picked?.kind === "feed" && picked.feedUrl === result.feedUrl}
                  onChange={() => {
                    onPickFeed({ feedUrl: result.feedUrl, title: result.title });
                  }}
                  className="size-5 flex-none accent-accent focus-visible:outline-2 focus-visible:outline-accent"
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
          <p className="text-xs text-faint">{t.noFeedFound}</p>
          <button
            type="button"
            onClick={() => {
              onMakeWebFeed({ pageUrl });
            }}
            className={primaryClassName}
          >
            {t.makeWebFeed}
          </button>
        </>
      ) : null}
      {canMakeWebFeed && results.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            onMakeWebFeed({ pageUrl });
          }}
          className={webFeedLinkClassName}
        >
          {t.makeWebFeedInstead}
        </button>
      ) : null}
    </form>
  );
};
