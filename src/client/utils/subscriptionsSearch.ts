import type {
  SubscriptionsPanel,
  SubscriptionsTab,
} from "client/components/subscriptions/manager/SubscriptionsManager";

export interface SubscriptionsSearch {
  tab?: SubscriptionsTab;
  // At most one of the three below opens the side panel.
  feed?: string;
  category?: string;
  // `true` or a category id, for the newsletter panel.
  newsletter?: true | string;
}

export const text = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

export const panelOf = ({
  feed,
  category,
  newsletter,
}: SubscriptionsSearch): SubscriptionsPanel | undefined => {
  if (feed !== undefined) return { kind: "feed", feedId: feed };
  if (category !== undefined) return { kind: "category", categoryId: category };
  if (newsletter !== undefined) {
    return { kind: "newsletter", categoryId: newsletter === true ? undefined : newsletter };
  }
  return undefined;
};

export const searchOf = (panel: SubscriptionsPanel | undefined): SubscriptionsSearch => ({
  feed: panel?.kind === "feed" ? panel.feedId : undefined,
  category: panel?.kind === "category" ? panel.categoryId : undefined,
  newsletter: panel?.kind === "newsletter" ? (panel.categoryId ?? true) : undefined,
});

export const panelSearch = (
  target: { kind: "feed"; feedId: string } | { kind: "category"; categoryId: string },
): SubscriptionsSearch =>
  target.kind === "feed"
    ? { tab: "feeds", ...searchOf(target) }
    : { tab: "categories", ...searchOf(target) };
