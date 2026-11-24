export const actionClassName = `
  min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  disabled:cursor-default disabled:opacity-50
  motion-safe:transition-colors
`;
export const primaryClassName = `${actionClassName} bg-accent text-on-accent not-disabled:hover:bg-accent/90`;
// No `flex-1`: the caller says how it sizes, since a retry button must not stretch.
export const secondaryClassName = `
  min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold text-ink
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  motion-safe:transition-colors
`;
