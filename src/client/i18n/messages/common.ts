import type { Messages } from "client/i18n/types";

// Frozen once seeded: a word another area needs stays in that area's file.
export const en = {
  back: "Back",
  cancel: "Cancel",
  close: "Close",
  confirm: "Confirm",
  delete: "Delete",
  loading: "Loading…",
  refresh: "Refresh",
  retry: "Retry",
  save: "Save",
  undo: "Undo",
} as const;

export const fr = {
  back: "Retour",
  cancel: "Annuler",
  close: "Fermer",
  confirm: "Confirmer",
  delete: "Supprimer",
  loading: "Chargement…",
  refresh: "Actualiser",
  retry: "Réessayer",
  save: "Enregistrer",
  undo: "Annuler",
} satisfies Messages<typeof en>;
