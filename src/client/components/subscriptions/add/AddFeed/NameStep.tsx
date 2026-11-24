import { useId, useRef, type ReactNode, type Ref } from "react";
import { WebFeedVariants } from "client/components/subscriptions/feeds/WebFeedVariants";
import { useT } from "client/i18n/useT";
import type { WebFeedStatus } from "shared/feedsApi/types";
import { FeedPreview } from "./FeedPreview";
import { inputClassName, stepFormId, type Picked } from "./shared";

interface NameFieldProps {
  name: string;
  onChange: (name: string) => void;
  error: string | undefined;
  ref: Ref<HTMLInputElement>;
}

const NameField = ({ name, onChange, error, ref }: NameFieldProps) => {
  const t = useT().subscriptions;
  const nameId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={nameId} className="text-xs font-semibold text-muted">
        {t.name}
      </label>
      <input
        ref={ref}
        id={nameId}
        type="text"
        autoComplete="off"
        value={name}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={error === undefined ? undefined : errorId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={`${inputClassName} aria-invalid:ring-danger`}
      />
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
};

interface NameFormProps {
  name: string;
  onNameChange: (name: string) => void;
  nameError: string | undefined;
  /** Enter or Next pressed; false when the step is incomplete. */
  onSubmit: () => boolean;
  children: ReactNode;
}

const NameForm = ({ name, onNameChange, nameError, onSubmit, children }: NameFormProps) => {
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <form
      id={stepFormId("name")}
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (onSubmit()) return;
        const field =
          name.trim() === ""
            ? nameRef.current
            : event.currentTarget.querySelector<HTMLElement>("fieldset input");
        field?.focus();
      }}
    >
      <NameField ref={nameRef} name={name} onChange={onNameChange} error={nameError} />
      {children}
    </form>
  );
};

interface FeedNameStepProps {
  picked: Extract<Picked, { kind: "feed" }>;
  name: string;
  onNameChange: (name: string) => void;
  nameError: string | undefined;
  onSubmit: () => boolean;
}

export const FeedNameStep = ({ picked, ...form }: FeedNameStepProps) => (
  <NameForm {...form}>
    <FeedPreview feedUrl={picked.feedUrl} originTitle={form.name.trim() || picked.title} />
  </NameForm>
);

interface WebFeedNameStepProps {
  name: string;
  onNameChange: (name: string) => void;
  nameError: string | undefined;
  onSubmit: () => boolean;
  status: WebFeedStatus | undefined;
  failed: boolean;
  timedOut: boolean;
  /** The page turned out to be a feed already, so there is no variant to pick. */
  directFeedUrl: string | undefined;
  selected: number | undefined;
  variantError: string | undefined;
  onSelect: (index: number) => void;
  onRetry: () => void;
}

export const WebFeedNameStep = ({
  status,
  failed,
  timedOut,
  directFeedUrl,
  selected,
  variantError,
  onSelect,
  onRetry,
  ...form
}: WebFeedNameStepProps) => {
  const t = useT().subscriptions;
  const variantErrorId = useId();

  return (
    <NameForm {...form}>
      {directFeedUrl === undefined ? (
        <div className="flex flex-col gap-2">
          <WebFeedVariants
            status={status}
            failed={failed}
            timedOut={timedOut}
            selected={selected}
            onSelect={onSelect}
            onRetry={onRetry}
            describedBy={variantError === undefined ? undefined : variantErrorId}
          />
          {variantError === undefined ? null : (
            <p id={variantErrorId} role="alert" className="text-sm text-danger">
              {variantError}
            </p>
          )}
        </div>
      ) : (
        <p role="status" className="text-xs text-faint">
          {t.alreadyFeed}
        </p>
      )}
    </NameForm>
  );
};
