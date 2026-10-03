import type { Messages } from "client/i18n/types";

// Frozen once seeded: a word another area needs stays in that area's file.
export const en = {
  back: "Back",
  cancel: "Cancel",
  close: "Close",
  delete: "Delete",
  loading: "Loading…",
  refresh: "Refresh",
  retry: "Retry",
  save: "Save",
} as const;

export const fr = {
  back: "Retour",
  cancel: "Annuler",
  close: "Fermer",
  delete: "Supprimer",
  loading: "Chargement…",
  refresh: "Actualiser",
  retry: "Réessayer",
  save: "Enregistrer",
} satisfies Messages<typeof en>;
