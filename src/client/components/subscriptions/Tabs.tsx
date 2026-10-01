import type { KeyboardEvent } from "react";

interface TabItem<Id extends string> {
  id: Id;
  label: string;
  count: number;
}

interface TabsProps<Id extends string> {
  /** Accessible name of the tab list. */
  label: string;
  /** Tabs to list, each with the count shown beside its label. */
  tabs: readonly TabItem<Id>[];
  /** Id of the active tab. */
  selected: Id;
  /** Tab chosen. */
  onSelect: (id: Id) => void;
}

// The caller gives its tab panel these ids, so `aria-controls` and `aria-labelledby` pair up.
export const tabId = (id: string): string => `tab-${id}`;
export const tabPanelId = (id: string): string => `tabpanel-${id}`;

// Same pill as the view toggles (ViewToggles.tsx), at the 44px touch height.
const tabClassName = `
  inline-flex min-h-11 flex-none items-center rounded-full px-4 text-sm font-medium
  whitespace-nowrap text-muted tabular-nums
  focus-visible:outline-2 focus-visible:outline-accent
  not-aria-selected:hover:bg-surface-2
  aria-selected:bg-accent-soft aria-selected:text-accent-text
  motion-safe:transition-colors
`;

// Automatic activation: the arrows move the selection itself, since each tab is one cheap render.
export const Tabs = <Id extends string>({ label, tabs, selected, onSelect }: TabsProps<Id>) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const index = tabs.findIndex((tab) => tab.id === selected);
    const moves: Partial<Record<string, number>> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1 + tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const move = moves[event.key];
    const target = move === undefined ? undefined : tabs.at(move % tabs.length);
    if (!target) return;
    event.preventDefault();
    onSelect(target.id);
    document.getElementById(tabId(target.id))?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className="flex gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={tabId(tab.id)}
          aria-selected={tab.id === selected}
          aria-controls={tabPanelId(tab.id)}
          tabIndex={tab.id === selected ? 0 : -1}
          onClick={() => {
            onSelect(tab.id);
          }}
          onKeyDown={handleKeyDown}
          className={tabClassName}
        >
          {`${tab.label} · ${tab.count}`}
        </button>
      ))}
    </div>
  );
};
