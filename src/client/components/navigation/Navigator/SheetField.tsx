import type { RefObject } from "react";
import type { NavigatorPanelHandle } from "client/components/navigation/NavigatorPanel";
import { ScopeChip } from "client/components/navigation/ScopeChip";
import { Icon } from "client/components/ui/icons";
import { tip } from "client/utils/tooltip";

interface SheetFieldProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  panelHandleRef: RefObject<NavigatorPanelHandle | null>;
  clearable: boolean;
  scopeLabel: string;
  onClearScope: () => void;
  onClearText: () => void;
}

export const SheetField = ({
  inputRef,
  query,
  onQueryChange,
  panelHandleRef,
  clearable,
  scopeLabel,
  onClearScope,
  onClearText,
}: SheetFieldProps) => (
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
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
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
          panelHandleRef.current?.handleKeyDown(event);
        }}
        placeholder={clearable ? "Search articles, feeds…" : "Search all articles, feeds…"}
        aria-label="Search articles and feeds"
        className={`
          min-w-0 flex-1 bg-transparent text-[0.98rem] text-ink outline-none
          placeholder:text-faint
          [&::-webkit-search-cancel-button]:appearance-none
        `}
      />
      {query === "" ? null : (
        <button
          type="button"
          {...tip({ label: "Clear search text" })}
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
