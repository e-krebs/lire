import { forwardRef, useEffect, useId } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { Icon } from "client/components/ui/icons";
import { ScopeChip } from "client/components/navigation/ScopeChip";
import { tip } from "client/utils/tooltip";
import { useActiveOverlay } from "client/hooks/useOverlay";
import type { SubscriptionsSearch } from "client/utils/subscriptionsSearch";
import { useTier } from "client/hooks/useTier";

interface LocationBarProps {
  onOpen: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  // Whether the scope is narrower than every article — the chip shows, and Backspace eats it.
  clearable: boolean;
  scopeLabel: string;
  onClearScope: () => void;
  onClearText: () => void;
  // The current feed or category's Subscriptions panel; absent for streams without one.
  edit?: { search: SubscriptionsSearch; label: string };
  // The view toggles, rendered behind a hairline at the pill's right end.
  viewControls?: ReactNode;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
};

// The ring sits on the pill rather than on the input, so it hugs the grey edge exactly.
const pillClassName = `
  flex h-10 w-full max-w-2xl min-w-0 items-center rounded-full bg-surface-2 pr-0.5
  has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-accent
`;

const clearButtonClassName = `
  flex size-10 flex-none items-center justify-center rounded-full text-faint
  hover:text-ink
  focus-visible:outline-2 focus-visible:outline-accent
`;

// The chip names a narrower stream; on All articles there is no chip, the placeholder says so.
const placeholderFor = (clearable: boolean): string =>
  clearable ? "Search articles, feeds…" : "Search all articles, feeds…";

interface PillEditLinkProps {
  edit: LocationBarProps["edit"];
  inert: true | undefined;
}

const PillEditLink = ({ edit, inert }: PillEditLinkProps) =>
  edit === undefined ? null : (
    <Link
      to="/subscriptions"
      search={edit.search}
      inert={inert}
      {...tip({ label: `Edit ${edit.label}` })}
      className={clearButtonClassName}
    >
      <Icon name="edit" className="size-4" />
    </Link>
  );

interface PillDividerProps {
  viewControls: ReactNode;
  inert: true | undefined;
}

const PillDivider = ({ viewControls, inert }: PillDividerProps) =>
  viewControls === undefined ? null : (
    <span inert={inert} className="contents">
      <span
        aria-hidden="true"
        className="mr-1.5 ml-0.5 h-5 w-0 flex-none border-l border-hairline"
      />
      {viewControls}
    </span>
  );

// One model for every tier: the chip is the stream, the text is the article search. From `sm` up
// the pill is the field itself (omnibox style, the Navigator popover anchors under it); below it,
// the same pill is a button that opens the Navigator sheet instead.
export const LocationBar = forwardRef<HTMLDivElement, LocationBarProps>(
  (
    {
      onOpen,
      draft,
      onDraftChange,
      onSearchKeyDown,
      inputRef,
      clearable,
      scopeLabel,
      onClearScope,
      onClearText,
      edit,
      viewControls,
    },
    ref,
  ) => {
    const tier = useTier();
    const locationId = useId();
    // Behind an open panel the pill goes inert, save the input when the panel is the Navigator.
    const activeOverlay = useActiveOverlay();
    const pillInert = activeOverlay !== null || undefined;
    const fieldInert = (activeOverlay !== null && activeOverlay !== "navigator") || undefined;

    useEffect(() => {
      const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
        // The input is inert then, and light dismiss closes the menu on the next click anyway.
        if (fieldInert) return;
        const withModifier = event.metaKey || event.ctrlKey;
        if (withModifier && event.key.toLowerCase() === "k") {
          event.preventDefault();
          onOpen();
          inputRef.current?.focus();
          return;
        }
        if (event.key === "/" && !isTypingTarget(event.target)) {
          event.preventDefault();
          onOpen();
          inputRef.current?.focus();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, [onOpen, inputRef, fieldInert]);

    const text = draft;

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
      // Backspace at the very start eats the chip first, like a mail composer's recipient token.
      if (
        event.key === "Backspace" &&
        clearable &&
        event.currentTarget.selectionStart === 0 &&
        event.currentTarget.selectionEnd === 0
      ) {
        event.preventDefault();
        onClearScope();
        return;
      }
      // Focus alone never opens the panel (a row activation hands focus back here, and that must
      // not reopen it); a key does, the way a combobox opens on ArrowDown.
      if (event.key === "ArrowDown") onOpen();
      onSearchKeyDown(event);
    };

    if (tier === "phone") {
      return (
        <div className="flex min-w-0 flex-1 justify-center">
          <div ref={ref} role="group" aria-label="Location" className={pillClassName}>
            {/* The button is the pill's left part, padding included, so its ring lines up with
                the pill's own left edge. */}
            <button
              type="button"
              onClick={onOpen}
              inert={fieldInert}
              {...tip({ label: "Open navigator" })}
              aria-describedby={locationId}
              className={`
                flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full pr-1.5 pl-3.5 text-left
                focus-visible:outline-2 focus-visible:outline-accent
              `}
            >
              <Icon name="search" className="size-4 flex-none text-faint" />
              {clearable ? <ScopeChip label={scopeLabel} /> : null}
              <span
                id={locationId}
                data-tip={text === "" ? undefined : text}
                data-tip-overflow=""
                data-empty={text === "" || undefined}
                className="min-w-0 flex-1 truncate text-sm font-semibold text-ink data-empty:font-normal data-empty:text-faint"
              >
                {text === "" ? placeholderFor(clearable) : text}
              </span>
            </button>
            <PillEditLink edit={edit} inert={pillInert} />
            <PillDivider viewControls={viewControls} inert={pillInert} />
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-w-0 flex-1 justify-center">
        <div ref={ref} role="group" aria-label="Location" className={pillClassName}>
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 pl-3.5">
            <Icon name="search" className="size-4 flex-none text-faint" />
            {clearable ? (
              // `contents` keeps the chip's 40% cap measured against the pill.
              <span inert={pillInert} className="contents">
                <ScopeChip label={scopeLabel} onClear={onClearScope} />
              </span>
            ) : null}
            <input
              ref={inputRef}
              type="search"
              value={text}
              inert={fieldInert}
              onClick={onOpen}
              onChange={(event) => {
                // Opening first, so the draft the panel reads is the character just typed.
                onOpen();
                onDraftChange(event.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholderFor(clearable)}
              aria-label="Search articles and feeds"
              aria-keyshortcuts="/ Meta+K"
              data-tip="Search articles and feeds"
              className={`
                min-w-0 flex-1 bg-transparent text-sm text-ink outline-none
                placeholder:text-faint
                [&::-webkit-search-cancel-button]:appearance-none
              `}
            />
            {text === "" ? null : (
              <button
                type="button"
                {...tip({ label: "Clear search text" })}
                inert={pillInert}
                onClick={onClearText}
                className={clearButtonClassName}
              >
                <Icon name="close" className="size-4" />
              </button>
            )}
          </div>
          <PillEditLink edit={edit} inert={pillInert} />
          <PillDivider viewControls={viewControls} inert={pillInert} />
        </div>
      </div>
    );
  },
);
LocationBar.displayName = "LocationBar";
