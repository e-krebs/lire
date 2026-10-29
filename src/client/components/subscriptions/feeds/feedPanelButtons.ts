const actionClassName = `
  min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold
  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  disabled:cursor-default disabled:opacity-50
  motion-safe:transition-colors
`;
export const submitClassName = `${actionClassName} bg-accent text-on-accent not-disabled:hover:bg-accent/90 data-clearing:bg-danger data-clearing:text-surface data-clearing:not-disabled:hover:bg-danger/90`;
export const neutralClassName = `${actionClassName} bg-surface-2 text-ink`;
export const dangerSoftClassName = `${actionClassName} bg-danger-soft text-danger`;
