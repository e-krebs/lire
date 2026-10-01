// Trigger attributes for the shared tooltip (see TooltipLayer). Any element may carry `data-tip`
// directly; add `data-tip-overflow=""` to show it only once the text is truncated (or give it a
// label to show while the text still fits), and `data-tip-side` to ask for another side than below. Icon-only controls use `tip()`, so the
// accessible name and the tooltip come from the same string.

export type TooltipSide = "top" | "bottom" | "left" | "right";

interface TipOptions {
  label: string;
  // `aria-keyshortcuts` syntax, e.g. "Meta+K" or "M"; shown in the tooltip as a key cap.
  shortcut?: string;
  side?: TooltipSide;
}

export const tip = ({ label, shortcut, side }: TipOptions) => ({
  "aria-label": label,
  "aria-keyshortcuts": shortcut,
  "data-tip": label,
  "data-tip-side": side,
});

const APPLE = /Mac|iPhone|iPad/.test(navigator.userAgent);

const KEY_NAMES: Record<string, string> = APPLE
  ? { Meta: "⌘", Control: "⌃", Alt: "⌥", Shift: "⇧" }
  : { Meta: "Ctrl", Control: "Ctrl" };

// `aria-keyshortcuts` lists alternatives separated by spaces: "Meta+K /" is two key caps.
export const shortcutList = (shortcuts: string): string[] => shortcuts.trim().split(/\s+/);

// "Meta+K" → "⌘K" on Apple platforms, "Ctrl+K" elsewhere.
export const displayShortcut = (shortcut: string): string =>
  shortcut
    .split("+")
    .map((part) => KEY_NAMES[part] ?? part)
    .join(APPLE ? "" : "+");

export const sideOf = (value: string | undefined): TooltipSide =>
  value === "top" || value === "left" || value === "right" ? value : "bottom";
