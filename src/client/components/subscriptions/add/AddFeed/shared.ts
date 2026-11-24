export const STEP_IDS = ["find", "name", "categories"] as const;
export type StepId = (typeof STEP_IDS)[number];

export const isStepId = (value: unknown): value is StepId => STEP_IDS.some((id) => id === value);

// `web` is a page to turn into a feed, whose variants come after the analysis.
export type Picked =
  | { kind: "feed"; feedUrl: string; title: string }
  | { kind: "web"; pageUrl: string };

export const stepFormId = (id: StepId): string => `add-feed-${id}`;

export const inputClassName = `
  min-h-11 w-full rounded-xl bg-surface px-3 text-sm text-ink ring-1 ring-hairline ring-inset
  focus-visible:outline-2 focus-visible:outline-accent
`;

export const headingClassName = "text-xl font-semibold text-ink focus-visible:outline-none";
