import type { RefObject } from "react";
import { ScopeChip } from "client/components/header/location/ScopeChip";
import type { LocationModel } from "client/components/header/location/locationModel";
import { Icon } from "client/components/primitives/icons/icons";
import { useT } from "client/i18n/useT";
import { tip } from "client/utils/tooltip";

interface SheetFieldProps {
  inputRef: RefObject<HTMLInputElement | null>;
  location: LocationModel;
}

export const SheetField = ({ inputRef, location }: SheetFieldProps) => {
  const {
    draft,
    onDraftChange,
    clearable,
    scopeLabel,
    onClearScope,
    onClearText,
    onSearchKeyDown,
  } = location;
  const t = useT().navigation;
  return (
    <div className="flex-none border-b border-hairline px-3.5 py-3 bar-bottom:border-t bar-bottom:border-b-0">
      <div
        className={`
        flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5
        focus-within:outline-2 focus-within:outline-accent
      `}
      >
        <Icon name="search" className="size-5 flex-none text-faint" />
        {clearable ? <ScopeChip label={scopeLabel} onClear={onClearScope} /> : null}
        <input
          ref={inputRef}
          type="search"
          value={draft}
          onChange={(event) => {
            onDraftChange(event.target.value);
          }}
          onKeyDown={(event) => {
            // Backspace at the very start eats the chip first, as in the desktop bar.
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
            onSearchKeyDown(event);
          }}
          placeholder={clearable ? t.searchScoped : t.searchAll}
          aria-label={t.searchArticlesAndFeeds}
          className={`
          min-w-0 flex-1 bg-transparent text-[0.98rem] text-ink outline-none
          placeholder:text-faint
          [&::-webkit-search-cancel-button]:appearance-none
        `}
        />
        {draft === "" ? null : (
          <button
            type="button"
            {...tip({ label: t.clearSearchText })}
            onClick={() => {
              onClearText();
              inputRef.current?.focus();
            }}
            className={`
            -my-1.5 flex size-10 flex-none items-center justify-center rounded-full text-faint
            hover:text-ink
            focus-visible:outline-2 focus-visible:outline-accent
          `}
          >
            <Icon name="close" className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
};
