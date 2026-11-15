import type { KeyboardEvent } from "react";
import type { MatchCount } from "client/api/queries";
import type { SubscriptionsSearch } from "client/utils/subscriptionsSearch";

export interface LocationModel {
  scopeKey: string;
  scopeLabel: string;
  clearable: boolean;
  count?: MatchCount | undefined;
  edit?: { search: SubscriptionsSearch; label: string } | undefined;
  draft: string;
  onDraftChange: (value: string) => void;
  onClearScope: () => void;
  onClearText: () => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}
