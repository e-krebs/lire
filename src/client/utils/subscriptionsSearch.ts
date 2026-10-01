import type {
  SubscriptionsPanel,
  SubscriptionsTab,
} from "client/components/subscriptions/SubscriptionsManager";

export interface SubscriptionsSearch {
  tab?: SubscriptionsTab;
  // At most one of the four below opens the side panel.
  feed?: string;
  category?: string;
  // `true` from the Navigator's "Add a feed…" entry point, or a category id to preselect.
  add?: true | string;
  // Same shape as `add`, for the newsletter panel.
  newsletter?: true | string;
}

export const text = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

export const panelOf = ({
  feed,
  category,
  add,
  newsletter,
}: SubscriptionsSearch): SubscriptionsPanel | undefined => {
  if (feed !== undefined) return { kind: "feed", feedId: feed };
  if (category !== undefined) return { kind: "category", categoryId: category };
  if (add !== undefined) return { kind: "add", categoryId: add === true ? undefined : add };
  if (newsletter !== undefined) {
    return { kind: "newsletter", categoryId: newsletter === true ? undefined : newsletter };
  }
  return undefined;
};

export const searchOf = (panel: SubscriptionsPanel | undefined): SubscriptionsSearch => ({
  feed: panel?.kind === "feed" ? panel.feedId : undefined,
  category: panel?.kind === "category" ? panel.categoryId : undefined,
  add: panel?.kind === "add" ? (panel.categoryId ?? true) : undefined,
  newsletter: panel?.kind === "newsletter" ? (panel.categoryId ?? true) : undefined,
});

export const panelSearch = (
  target: { kind: "feed"; feedId: string } | { kind: "category"; categoryId: string },
): SubscriptionsSearch =>
  target.kind === "feed"
    ? { tab: "feeds", ...searchOf(target) }
    : { tab: "categories", ...searchOf(target) };
