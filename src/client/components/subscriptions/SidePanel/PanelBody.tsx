import type { KeyboardEventHandler, RefObject } from "react";
import { Icon } from "client/components/ui/icons";
import { tip } from "client/utils/tooltip";
import type { SidePanelProps } from "./shared";

interface PanelBodyProps extends Omit<SidePanelProps, "open"> {
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}

export const PanelBody = ({
  onClose,
  title,
  subtitle,
  leading,
  children,
  actions,
  headingId,
  headingRef,
  onKeyDown,
}: PanelBodyProps) => (
  // Escape reaches here from the focused heading or control inside; the div is no control.
  // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
  <div onKeyDown={onKeyDown} className="flex h-full min-h-0 flex-col">
    <header className="flex flex-none items-center gap-2 border-b border-hairline py-2 pr-2 pl-4">
      {leading}
      <div className="min-w-0 flex-1">
        <h2
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          data-tip={title}
          data-tip-overflow=""
          className="side-panel-title w-fit max-w-full truncate text-base font-semibold text-ink outline-none"
        >
          {title}
        </h2>
        {subtitle === undefined ? null : (
          <div className="side-panel-subtitle w-fit max-w-full truncate text-xs text-faint">
            {subtitle}
          </div>
        )}
      </div>
      <button
        type="button"
        {...tip({ label: `Close ${title}` })}
        onClick={onClose}
        className={`
          flex size-11 flex-none items-center justify-center rounded-full text-muted
          hover:bg-surface-2 hover:text-ink
          focus-visible:outline-2 focus-visible:outline-accent
        `}
      >
        <Icon name="close" className="size-4" />
      </button>
    </header>
    <div className="scroll-pane min-h-0 flex-1 overflow-y-auto">{children}</div>
    {actions === undefined ? null : (
      <div className="flex flex-none gap-2 border-t border-hairline px-4 pt-3 pb-4">{actions}</div>
    )}
  </div>
);
