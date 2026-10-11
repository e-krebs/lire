import type { Messages } from "client/i18n/types";

// Frozen once seeded: shared verbs, plus the strings of components/primitives, which must not depend on a domain area.
export const en = {
  alsoIn: ({ names }: { names: string }) => `, also in ${names}`,
  back: "Back",
  cancel: "Cancel",
  close: "Close",
  closePanel: ({ title }: { title: string }) => `Close ${title}`,
  delete: "Delete",
  loading: "Loading…",
  refresh: "Refresh",
  retry: "Retry",
  save: "Save",
} as const;

export const fr = {
  alsoIn: ({ names }) => `, aussi dans ${names}`,
  back: "Retour",
  cancel: "Annuler",
  close: "Fermer",
  closePanel: ({ title }) => `Fermer ${title}`,
  delete: "Supprimer",
  loading: "Chargement…",
  refresh: "Actualiser",
  retry: "Réessayer",
  save: "Enregistrer",
} satisfies Messages<typeof en>;
