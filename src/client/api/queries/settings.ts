import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  getOnboarding,
  getPreferences,
  patchOnboarding,
  updatePreferences,
} from "client/api/client";
import { keys } from "client/api/keys";
import { orderCategories } from "client/api/selectors";
import { CATEGORY_ORDER_KEY } from "shared/feedsApi/preferences";
import type {
  OnboardingPatch,
  OnboardingState,
  Preferences,
  PreferencesUpdate,
} from "shared/feedsApi/types";
import { OnboardingStepIdSchema } from "shared/feedsApi/types";
import { useCategories } from "./session";

export const DIRECT_OPEN_STORAGE_KEY = "lire.directOpen";

// One GET per session: the preferences only change through this app's own toggles, which write
// straight into the cache.
export const usePreferences = () =>
  useQuery({
    queryKey: keys.preferences,
    queryFn: getPreferences,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

export const useOnboarding = () =>
  useQuery({
    queryKey: keys.onboarding,
    queryFn: getOnboarding,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

export const useUpdateOnboarding = () => {
  const client = useQueryClient();
  const othersPending = () => client.isMutating({ mutationKey: keys.onboarding }) - 1;
  return useMutation({
    mutationKey: keys.onboarding,
    mutationFn: patchOnboarding,
    onMutate: async (patch: OnboardingPatch) => {
      await client.cancelQueries({ queryKey: keys.onboarding });
      const previous = client.getQueryData<OnboardingState>(keys.onboarding);
      if (previous) {
        const next: OnboardingState = { ...previous, done: { ...previous.done } };
        for (const step of OnboardingStepIdSchema.options) {
          const value = patch.done?.[step];
          if (value === true) next.done[step] = true;
          else if (value === false) delete next.done[step];
        }
        if (patch.collapsed !== undefined) next.collapsed = patch.collapsed;
        if (patch.dismissed !== undefined) next.dismissed = patch.dismissed;
        client.setQueryData(keys.onboarding, next);
      }
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (othersPending() === 0 && context?.previous) {
        client.setQueryData(keys.onboarding, context.previous);
      }
    },
    onSuccess: (state) => {
      if (othersPending() === 0) client.setQueryData(keys.onboarding, state);
    },
    onSettled: () => {
      if (othersPending() === 0) void client.invalidateQueries({ queryKey: keys.onboarding });
    },
  });
};

// Holds the rows until the stored order is known, so they never show in API order first. A failed
// load counts as settled: preferences fall back to API order, categories to no rows.
export const useOrderedCategories = () => {
  const categories = useCategories();
  const preferences = usePreferences();
  return {
    categories: orderCategories({
      categories: categories.data ?? [],
      preferences: preferences.data,
    }),
    ready: !categories.isPending && !preferences.isPending,
  };
};

// A failed write that overlapped a later one leaves its optimistic value behind; the last write
// of the run then refetches the store.
const staleAfterOverlap = new WeakMap<QueryClient, boolean>();

// The scope sends writes one at a time, but every onMutate runs at once, so a snapshot can hold an
// earlier write's optimistic value: only the last write in the queue settles the cache.
export const useUpdatePreferences = () => {
  const client = useQueryClient();
  const othersPending = () => client.isMutating({ mutationKey: keys.preferences }) - 1;
  const refetchIfStale = () => {
    if (!staleAfterOverlap.get(client)) return;
    staleAfterOverlap.delete(client);
    void client.invalidateQueries({ queryKey: keys.preferences });
  };
  return useMutation({
    mutationKey: keys.preferences,
    scope: { id: "preferences" },
    mutationFn: updatePreferences,
    meta: { notifyOnFailure: true },
    onMutate: async (patch: PreferencesUpdate) => {
      const overlapped = othersPending() > 0;
      await client.cancelQueries({ queryKey: keys.preferences });
      const previous = client.getQueryData<Preferences>(keys.preferences);
      client.setQueryData<Preferences>(keys.preferences, (prev) => {
        const next: Preferences = { ...prev };
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) delete next[key];
          else next[key] = value;
        }
        return next;
      });
      return { previous, overlapped };
    },
    onError: (_error, _patch, context) => {
      if (!context) return;
      if (othersPending() > 0) {
        staleAfterOverlap.set(client, true);
        return;
      }
      client.setQueryData(keys.preferences, context.previous);
      if (context.overlapped) staleAfterOverlap.set(client, true);
      refetchIfStale();
    },
    onSuccess: () => {
      if (othersPending() === 0) refetchIfStale();
    },
  });
};

export const useSavingPreferences = (): boolean =>
  useIsMutating({ mutationKey: keys.preferences }) > 0;

export const useReorderCategories = () => {
  const update = useUpdatePreferences();
  const toPatch = ({ categoryIds }: { categoryIds: string[] }) => ({
    [CATEGORY_ORDER_KEY]: JSON.stringify(categoryIds),
  });
  return {
    ...update,
    mutate: (variables: { categoryIds: string[] }) => {
      update.mutate(toPatch(variables));
    },
    mutateAsync: async (variables: { categoryIds: string[] }) =>
      update.mutateAsync(toPatch(variables)),
  };
};
