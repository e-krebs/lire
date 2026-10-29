import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { useBackdropDismiss } from "client/components/primitives/overlays/ConfirmDialog";
import { Tabs, tabId, tabPanelId } from "client/components/primitives/controls/Tabs";
import { Icon } from "client/components/primitives/icons/icons";

export const HowToWay = ({
  icon,
  children,
}: {
  icon: "touch" | "mouse" | "keyboard";
  children: ReactNode;
}) => (
  <li className="flex items-start gap-3 text-sm text-muted">
    <Icon name={icon} className="-mt-0.5 size-6 flex-none text-ink" />
    <div className="flex min-w-0 flex-col gap-2">{children}</div>
  </li>
);

// The three ways always appear in this order, whatever the device.
export const HowToWays = ({
  touch,
  mouse,
  keyboard,
}: {
  touch: ReactNode;
  mouse: ReactNode;
  keyboard: ReactNode;
}) => (
  <ul className="flex flex-col gap-3">
    {touch}
    {mouse}
    {keyboard}
  </ul>
);

const navClassName = `
  inline-flex min-h-11 items-center gap-1 rounded-xl px-4 text-sm font-semibold text-accent-text
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  disabled:opacity-40
`;

interface HowToTab<Id extends string> {
  id: Id;
  label: string;
  content: ReactNode;
}

interface HowToDialogProps<Id extends string> {
  open: boolean;
  onClose: () => void;
  // The "See how" button: native focus return is not reliable on every engine (WebKit), so it is explicit.
  returnFocusRef: RefObject<HTMLElement | null>;
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  closeLabel: string;
  tabsLabel: string;
  previousLabel: string;
  nextLabel: string;
  tabs: readonly HowToTab<Id>[];
  tab: Id;
  onSelectTab: (tab: Id) => void;
}

// A native modal <dialog>: showModal() gives the focus trap, Escape and the return of focus to the
// button that opened it. The owner holds the tab and the content; this shell holds the frame.
export const HowToDialog = <Id extends string>({
  open,
  onClose,
  returnFocusRef,
  dialogRef,
  title,
  closeLabel,
  tabsLabel,
  previousLabel,
  nextLabel,
  tabs,
  tab,
  onSelectTab,
}: HowToDialogProps<Id>) => {
  const titleId = useId();
  const backdropDismiss = useBackdropDismiss(onClose);
  const wasOpen = useRef(false);
  const index = tabs.findIndex(({ id }) => id === tab);

  const selectTab = (next: Id): void => {
    onSelectTab(next);
    document.getElementById(tabId(next))?.focus();
  };
  // A programmatic close (the effect below) fires this event too: only a dismissal reports up.
  const handleDialogClose = () => {
    if (open) onClose();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      wasOpen.current = true;
      if (dialog.open) return;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      return;
    }
    if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      returnFocusRef.current?.focus();
    }
  }, [open, returnFocusRef, dialogRef]);

  return (
    // Backdrop light-dismiss: the inner wrapper holds the padding, so a press there is not a backdrop press.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...backdropDismiss}
      onClose={handleDialogClose}
      className={`
        how-to m-auto hidden w-[calc(100%-2rem)] max-w-md rounded-2xl border-0 bg-surface p-0 text-ink
        shadow-2xl backdrop:bg-scrim/35
        open:block
        max-sm:inset-0 max-sm:m-0 max-sm:size-full max-sm:max-h-none max-sm:max-w-none
        max-sm:overflow-hidden max-sm:rounded-none max-sm:open:flex max-sm:open:flex-col
      `}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          data-how-scroll=""
          className={`
            flex min-h-0 flex-1 flex-col gap-4 overflow-x-clip overflow-y-auto p-5
            max-sm:pt-[max(1.25rem,env(safe-area-inset-top))]
          `}
        >
          <div className="flex items-center gap-3">
            <h2 id={titleId} className="min-w-0 flex-1 text-base font-semibold text-balance">
              {title}
            </h2>
            <button
              type="button"
              aria-label={closeLabel}
              onClick={onClose}
              className="-mr-2 flex size-11 flex-none items-center justify-center rounded-full text-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name="close" className="size-5" />
            </button>
          </div>
          <div className="flex justify-center">
            <Tabs
              label={tabsLabel}
              tabs={tabs.map(({ id, label }) => ({ id, label }))}
              selected={tab}
              onSelect={onSelectTab}
            />
          </div>
          {tabs.map(({ id, content }) => (
            <div
              key={id}
              role="tabpanel"
              id={tabPanelId(id)}
              aria-labelledby={tabId(id)}
              hidden={tab !== id}
              tabIndex={0}
            >
              {content}
            </div>
          ))}
        </div>
        <div
          className={`
            flex flex-none items-center justify-between gap-2 px-5 pb-5
            max-sm:border-t max-sm:border-hairline max-sm:bg-surface max-sm:pt-3
            max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]
          `}
        >
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => {
              const previous = index > 0 ? tabs.at(index - 1) : undefined;
              if (previous) selectTab(previous.id);
            }}
            className={navClassName}
          >
            <Icon name="chevron" className="size-4 rotate-180" />
            {previousLabel}
          </button>
          <button
            type="button"
            disabled={index >= tabs.length - 1}
            onClick={() => {
              const next = tabs.at(index + 1);
              if (next) selectTab(next.id);
            }}
            className={navClassName}
          >
            {nextLabel}
            <Icon name="chevron" className="size-4" />
          </button>
        </div>
      </div>
    </dialog>
  );
};
