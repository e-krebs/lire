import type { ReactNode } from "react";

// A switch, not a checkbox: it takes effect at once, with no Save to press. The whole label is
// the 40px hit area; the visible ring goes on the track, since the box itself is screen-reader only.
const switchClassName = `
  relative flex min-h-10 cursor-pointer items-center gap-2
  text-sm whitespace-nowrap text-muted
`;

// `surface-2` is the canvas colour, so the off track would vanish on this page: the mock-up's
// translucent ink reads on both schemes.
const switchTrackClassName = `
  h-5 w-9 flex-none rounded-full bg-ink/25
  peer-checked:bg-accent
  peer-focus-visible:outline-2 peer-focus-visible:outline-accent
  motion-safe:transition-colors
`;

// Anchored to the track's right edge, which is the label's, since the track is its last box.
const switchThumbClassName = `
  pointer-events-none absolute top-1/2 right-0.5 size-4 -translate-x-4 -translate-y-1/2
  rounded-full bg-surface shadow-sm
  peer-checked:translate-x-0 peer-checked:bg-on-accent peer-checked:shadow-none
  motion-safe:transition-[translate,background-color]
`;

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label of the row. */
  children: ReactNode;
  /** Only when the visible text is too terse on its own to name the row. */
  label?: string;
  className?: string;
}

export const Switch = ({ checked, onChange, children, label, className }: SwitchProps) => (
  <label className={className === undefined ? switchClassName : `${switchClassName} ${className}`}>
    <input
      type="checkbox"
      className="peer sr-only"
      aria-label={label}
      checked={checked}
      onChange={(event) => {
        onChange(event.target.checked);
      }}
    />
    {children}
    <span aria-hidden="true" className={switchTrackClassName} />
    <span aria-hidden="true" className={switchThumbClassName} />
  </label>
);
