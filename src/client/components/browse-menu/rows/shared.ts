// The two built-in streams above the categories: All articles and Recently read.
export const NO_ROW = -1;

// The width of a row's trailing edit link. Every row keeps it clear, link or not, so the count
// badges and ↵ hints all end on the same line.
const editGutterClassName = "pr-10";

export const builtInRowClassName = `
  group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 text-left
  font-bold text-ink ${editGutterClassName}
  hover:bg-surface-2
  data-selected:bg-accent-soft data-selected:shadow-[inset_0_0_0_1.5px_var(--color-accent)]
`;

export const builtInIconClassName = `
  flex size-6 flex-none items-center justify-center text-muted
  group-data-current:text-accent-text
`;

export const categoryRowKey = (id: string): string => `category:${id}`;
export const feedRowKey = (id: string): string => `feed:${id}`;

// The wrapper carries the current/selected fill; the button inside is the whole row, so the hover
// surface and the click surface are one and the same.
export const rowClassName = `
  group relative rounded-lg
  data-selected:bg-accent-soft data-selected:shadow-[inset_0_0_0_1.5px_var(--color-accent)]
`;

export const rowButtonClassName = `
  flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left
  ${editGutterClassName}
  hover:bg-surface-2
  focus-visible:outline-2 focus-visible:outline-accent
`;

export const countBadgeClassName = `
  flex-none rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted tabular-nums
`;

export const enterHintClassName = `
  flex-none rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.68rem] font-bold text-faint
`;

export const sectionHeadingClassName = `mb-1 px-2 text-xs font-bold tracking-wide text-muted uppercase`;

export const SUBSCRIPTIONS_ROW_KEY = "subscriptions";
