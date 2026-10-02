import { pluralFor } from "client/i18n/plural";
import type { Messages } from "client/i18n/types";

const enPlural = pluralFor("en");
const frPlural = pluralFor("fr");

export const en = {
  tabsLabel: "Subscriptions",
  tabCategories: "Categories",
  tabFeeds: "Feeds",
  loadingCategories: "Loading categories",
  loadFailed: ({ message }: { message: string }) => `Could not load your subscriptions. ${message}`,

  addSources: "＋ Add sources",
  addSourcesGroup: "Add sources",
  addWebsite: "Add website",
  addNewsletter: "Add newsletter",

  name: "Name",
  subscribe: "Subscribe",
  unsubscribe: "Unsubscribe",
  unsubscribeEllipsis: "Unsubscribe…",
  saveChanges: "Save changes",
  createCategoryFailed: ({ message }: { message: string }) =>
    `Could not create that category. ${message}`,
  unsubscribeFailed: ({ message }: { message: string }) => `Could not unsubscribe. ${message}`,
  alsoIn: ({ names }: { names: string }) => `, also in ${names}`,
  unread: " unread",

  feedCount: ({ count }: { count: number }) =>
    count === 0 ? "No feed" : enPlural({ count, one: () => "1 feed", other: (n) => `${n} feeds` }),
  filterFeeds: "Filter feeds",
  filterFeedsPlaceholder: "Filter feeds…",
  feedsSummary: ({ count, shared }: { count: number; shared: number }) =>
    `${enPlural({ count, one: () => "1 feed", other: (n) => `${n} feeds` })}, ${shared} of them in more than one category`,
  noFeeds: "Feeds you follow show here. Add one by its site or feed URL.",
  noFeedMatches: ({ query }: { query: string }) => `No feed matches “${query}”`,

  filterCategories: "Filter categories",
  filterCategoriesPlaceholder: "Filter categories…",
  newCategory: "＋ New",
  noCategories: "Categories group your feeds. Create one with “＋ New”.",
  noCategoryMatches: ({ query }: { query: string }) => `No category matches “${query}”`,
  reorderFailed: "Could not save the new order. Move the category again to retry.",
  reorder: ({ label }: { label: string }) => `Reorder ${label}`,
  newCategoryName: "New category name",
  enterCategoryName: "Enter a name for the category.",
  createCategory: "Create category",
  positionOf: ({ index, total }: { index: number; total: number }) =>
    `position ${index} of ${total}`,
  dragPickedUp: ({ label, position }: { label: string; position: string }) =>
    `Picked up ${label}, at ${position}.`,
  dragMoved: ({ label, position }: { label: string; position: string }) =>
    `${label} moved to ${position}.`,
  dragDropped: ({ label, position }: { label: string; position: string }) =>
    `${label} dropped at ${position}.`,
  dragCancelled: ({ label }: { label: string }) => `Move cancelled. ${label} stays in place.`,

  categoriesHeading: ({ selected, total }: { selected: number; total: number }) =>
    `Categories · ${selected} of ${total}`,
  filterCategoriesCount: ({ count }: { count: number }) => `Filter ${count} categories…`,
  createOption: ({ name }: { name: string }) => `Create “${name}”`,
  noCategoryYet: "No category yet",

  noFeedsInCategory: "No feeds in this category yet.",
  addOrTick: "Add one, or tick this category in another feed's panel.",

  enterCategoryNameForPanel: "Enter a name for this category.",
  renameFailed: ({ message }: { message: string }) => `Could not rename this category. ${message}`,
  lockedTip: "Its feeds have no other category to move to",
  deleteCategoryEllipsis: "Delete category…",
  alsoInAnother: ({ count }: { count: number }) => ` · ${count} also in another category`,
  feedsHeading: ({ count }: { count: number }) => `Feeds · ${count}`,
  filterFeedsIn: ({ label }: { label: string }) => `Filter feeds in ${label}`,
  filterPlaceholder: ({ feedCount }: { feedCount: string }) => `Filter ${feedCount}…`,
  removeFeed: ({ title, label }: { title: string; label: string }) =>
    `Remove ${title} from ${label}`,
  removeFeedFailed: ({ message }: { message: string }) => `Could not remove that feed. ${message}`,
  removeHint: "✕ removes the feed from this category only.",
  removeHintOrphans: ({ count }: { count: number }) =>
    `✕ removes the feed from this category only. Deleting the category asks where the ${enPlural({ count, one: () => "feed", other: (n) => `${n} feeds` })} with no other category go.`,
  thisFeed: "this feed",
  unsubscribeTitle: ({ title }: { title: string }) => `Unsubscribe from ${title}?`,
  onlyCategory: ({ label }: { label: string }) =>
    `${label} is its only category, so removing it unsubscribes the feed. Subscribing again starts from an empty history.`,

  deleteTitle: ({ label }: { label: string }) => `Delete ${label}?`,
  deleteCategory: "Delete category",
  deleteAndMove: ({ count }: { count: number }) =>
    `Delete and move ${enPlural({ count, one: () => "1 feed", other: (n) => `${n} feeds` })}`,
  moveTo: ({ count }: { count: number }) =>
    `Move ${enPlural({ count, one: () => "1 feed", other: (n) => `${n} feeds` })} to`,
  alsoMove: ({ count }: { count: number }) =>
    `Also move the ${enPlural({ count, one: () => "feed that sits", other: (n) => `${n} feeds that sit` })} in another category`,
  pickAnother: ({ label }: { label: string }) =>
    `${label} is the category being deleted. Pick another one.`,
  deleteFailed: ({ label, message }: { label: string; message: string }) =>
    `Could not delete ${label}. ${message}`,
  moveFailed: ({ count, cause, label }: { count: number; cause: string; label: string }) =>
    `Moved ${enPlural({ count, one: () => "1 feed", other: (n) => `${n} feeds` })}, then one move failed.${cause === "" ? "" : ` ${cause}`} ${label} is still here, so trying again is safe.`,
  effectNone: "It holds no feed, so nothing else changes.",
  effectAllShared: ({ count }: { count: number }) =>
    enPlural({
      count,
      one: () => "Its one feed sits in another category and only loses this one.",
      other: (n) => `All ${n} of its feeds sit in another category and only lose this one.`,
    }),
  effectAllOrphans: ({ count }: { count: number }) =>
    enPlural({
      count,
      one: () => "Its one feed has no other category, so it needs a new one.",
      other: (n) => `Its ${n} feeds have no other category, so they need a new one.`,
    }),
  effectShared: ({ count, total }: { count: number; total: number }) =>
    enPlural({
      count,
      one: () => `1 of its ${total} feeds sits in another category and only loses this one.`,
      other: (n) => `${n} of its ${total} feeds sit in another category and only lose this one.`,
    }),
  effectOrphans: ({ count }: { count: number }) =>
    enPlural({
      count,
      one: () => "The other one has no other category, so it needs a new one.",
      other: (n) => `The other ${n} have no other category, so they need a new one.`,
    }),

  closePanel: ({ title }: { title: string }) => `Close ${title}`,

  unsubscribeBody: ({ losses }: { losses: string }) =>
    `Lire drops ${losses}. Subscribing again starts from an empty history.`,
  lossFeed: "the feed",
  lossCategories: ({ count }: { count: number }) =>
    enPlural({
      count,
      one: () => "its category",
      other: (n) => `its ${n} categories`,
    }),
  lossUnread: ({ count }: { count: number }) =>
    enPlural({
      count,
      one: () => "its unread article",
      other: (n) => `its ${n} unread articles`,
    }),
  titleLabel: "Title",
  enterTitle: "Enter a title for this feed.",
  opensOnSite: "Opens on its site",
  clearingHint: "Clearing every box unsubscribes this feed.",
  saveFeedFailed: ({ message }: { message: string }) => `Could not save this feed. ${message}`,

  addNewsletterTitle: "Add a newsletter",
  newsletterStep1: "Step 1 of 2 · get an address",
  newsletterStep2: "Step 2 of 2 · name it and pick where it lands",
  generateAddress: "Generate address",
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Could not copy. Select the address and copy it by hand.",
  createAddressFailed: ({ message }: { message: string }) =>
    `Could not create an address. ${message}`,
  subscribeNewsletterFailed: ({ message }: { message: string }) =>
    `Could not subscribe to that newsletter. ${message}`,

  addFeedTitle: "Add a feed",
  feedStep1: "Step 1 of 2 · find the feed",
  feedStep2: "Step 2 of 2 · pick where it lands",
  feedUrlLabel: "Feed or site URL",
  searching: "Searching…",
  resultCount: ({ count }: { count: number }) =>
    enPlural({ count, one: () => "1 result", other: (n) => `${n} results` }),
  enterUrl: "Enter a feed or site URL.",
  lookupFailed: ({ message }: { message: string }) => `Could not look up that URL. ${message}`,
  subscribeFeedFailed: ({ message }: { message: string }) =>
    `Could not subscribe to that feed. ${message}`,
  results: "Results",
  pickCategory: "Pick at least one category for this feed.",
} as const;

export const fr = {
  tabsLabel: "Abonnements",
  tabCategories: "Catégories",
  tabFeeds: "Flux",
  loadingCategories: "Chargement des catégories",
  loadFailed: ({ message }) => `Impossible de charger vos abonnements. ${message}`,

  addSources: "＋ Ajouter des sources",
  addSourcesGroup: "Ajouter des sources",
  addWebsite: "Ajouter un site",
  addNewsletter: "Ajouter une newsletter",

  name: "Nom",
  subscribe: "S'abonner",
  unsubscribe: "Se désabonner",
  unsubscribeEllipsis: "Se désabonner…",
  saveChanges: "Enregistrer les modifications",
  createCategoryFailed: ({ message }) => `Impossible de créer cette catégorie. ${message}`,
  unsubscribeFailed: ({ message }) => `Impossible de se désabonner. ${message}`,
  alsoIn: ({ names }) => `, aussi dans ${names}`,
  unread: " non lus",

  feedCount: ({ count }) =>
    count === 0
      ? "Aucun flux"
      : frPlural({ count, one: (n) => `${n} flux`, other: (n) => `${n} flux` }),
  filterFeeds: "Filtrer les flux",
  filterFeedsPlaceholder: "Filtrer les flux…",
  feedsSummary: ({ count, shared }) =>
    `${frPlural({ count, one: (n) => `${n} flux`, other: (n) => `${n} flux` })}, dont ${shared} dans plusieurs catégories`,
  noFeeds:
    "Les flux que vous suivez apparaissent ici. Ajoutez-en un via l'URL de son site ou de son flux.",
  noFeedMatches: ({ query }) => `Aucun flux ne correspond à « ${query} »`,

  filterCategories: "Filtrer les catégories",
  filterCategoriesPlaceholder: "Filtrer les catégories…",
  newCategory: "＋ Nouvelle",
  noCategories: "Les catégories regroupent vos flux. Créez-en une avec « ＋ Nouvelle ».",
  noCategoryMatches: ({ query }) => `Aucune catégorie ne correspond à « ${query} »`,
  reorderFailed:
    "Impossible d'enregistrer le nouvel ordre. Déplacez de nouveau la catégorie pour réessayer.",
  reorder: ({ label }) => `Réorganiser ${label}`,
  newCategoryName: "Nom de la nouvelle catégorie",
  enterCategoryName: "Saisissez un nom pour la catégorie.",
  createCategory: "Créer la catégorie",
  positionOf: ({ index, total }) => `position ${index} sur ${total}`,
  dragPickedUp: ({ label, position }) => `${label} saisie, en ${position}.`,
  dragMoved: ({ label, position }) => `${label} déplacée en ${position}.`,
  dragDropped: ({ label, position }) => `${label} déposée en ${position}.`,
  dragCancelled: ({ label }) => `Déplacement annulé. ${label} reste à sa place.`,

  categoriesHeading: ({ selected, total }) => `Catégories · ${selected} sur ${total}`,
  filterCategoriesCount: ({ count }) =>
    frPlural({
      count,
      one: () => `Filtrer ${count} catégorie…`,
      other: (n) => `Filtrer ${n} catégories…`,
    }),
  createOption: ({ name }) => `Créer « ${name} »`,
  noCategoryYet: "Aucune catégorie pour le moment",

  noFeedsInCategory: "Aucun flux dans cette catégorie pour le moment.",
  addOrTick: "Ajoutez-en un, ou cochez cette catégorie dans le panneau d'un autre flux.",

  enterCategoryNameForPanel: "Saisissez un nom pour cette catégorie.",
  renameFailed: ({ message }) => `Impossible de renommer cette catégorie. ${message}`,
  lockedTip: "Ses flux n'ont aucune autre catégorie où aller",
  deleteCategoryEllipsis: "Supprimer la catégorie…",
  alsoInAnother: ({ count }) => ` · ${count} aussi dans une autre catégorie`,
  feedsHeading: ({ count }) => `Flux · ${count}`,
  filterFeedsIn: ({ label }) => `Filtrer les flux de ${label}`,
  filterPlaceholder: ({ feedCount }) => `Filtrer ${feedCount}…`,
  removeFeed: ({ title, label }) => `Retirer ${title} de ${label}`,
  removeFeedFailed: ({ message }) => `Impossible de retirer ce flux. ${message}`,
  removeHint: "✕ retire le flux de cette catégorie uniquement.",
  removeHintOrphans: ({ count }) =>
    `✕ retire le flux de cette catégorie uniquement. Supprimer la catégorie demande où placer ${frPlural({ count, one: () => "le flux", other: (n) => `les ${n} flux` })} sans autre catégorie.`,
  thisFeed: "ce flux",
  unsubscribeTitle: ({ title }) => `Se désabonner de ${title} ?`,
  onlyCategory: ({ label }) =>
    `${label} est sa seule catégorie : la retirer désabonne du flux. Se réabonner repart d'un historique vide.`,

  deleteTitle: ({ label }) => `Supprimer ${label} ?`,
  deleteCategory: "Supprimer la catégorie",
  deleteAndMove: ({ count }) =>
    `Supprimer et déplacer ${frPlural({ count, one: (n) => `${n} flux`, other: (n) => `${n} flux` })}`,
  moveTo: ({ count }) =>
    `Déplacer ${frPlural({ count, one: (n) => `${n} flux`, other: (n) => `${n} flux` })} vers`,
  alsoMove: ({ count }) =>
    `Déplacer aussi ${frPlural({ count, one: () => "le flux qui figure", other: (n) => `les ${n} flux qui figurent` })} dans une autre catégorie`,
  pickAnother: ({ label }) =>
    `${label} est la catégorie en cours de suppression. Choisissez-en une autre.`,
  deleteFailed: ({ label, message }) => `Impossible de supprimer ${label}. ${message}`,
  moveFailed: ({ count, cause, label }) =>
    `${frPlural({ count, one: (n) => `${n} flux déplacé`, other: (n) => `${n} flux déplacés` })}, puis un déplacement a échoué.${cause === "" ? "" : ` ${cause}`} ${label} est toujours là : réessayer est sans risque.`,
  effectNone: "Elle ne contient aucun flux, rien d'autre ne change.",
  effectAllShared: ({ count }) =>
    frPlural({
      count,
      one: () => "Son unique flux figure dans une autre catégorie et perd seulement celle-ci.",
      other: (n) =>
        `Ses ${n} flux figurent tous dans une autre catégorie et perdent seulement celle-ci.`,
    }),
  effectAllOrphans: ({ count }) =>
    frPlural({
      count,
      one: () => "Son unique flux n'a aucune autre catégorie, il lui en faut une nouvelle.",
      other: (n) => `Ses ${n} flux n'ont aucune autre catégorie, il leur en faut une nouvelle.`,
    }),
  effectShared: ({ count, total }) =>
    frPlural({
      count,
      one: () =>
        `1 de ses ${total} flux figure dans une autre catégorie et perd seulement celle-ci.`,
      other: (n) =>
        `${n} de ses ${total} flux figurent dans une autre catégorie et perdent seulement celle-ci.`,
    }),
  effectOrphans: ({ count }) =>
    frPlural({
      count,
      one: () => "L'autre n'a aucune autre catégorie, il lui en faut une nouvelle.",
      other: (n) => `Les ${n} autres n'ont aucune autre catégorie, il leur en faut une nouvelle.`,
    }),

  closePanel: ({ title }) => `Fermer ${title}`,

  unsubscribeBody: ({ losses }) =>
    `Lire supprime ${losses}. Se réabonner repart d'un historique vide.`,
  lossFeed: "le flux",
  lossCategories: ({ count }) =>
    frPlural({
      count,
      one: () => "sa catégorie",
      other: (n) => `ses ${n} catégories`,
    }),
  lossUnread: ({ count }) =>
    frPlural({
      count,
      one: () => "son article non lu",
      other: (n) => `ses ${n} articles non lus`,
    }),
  titleLabel: "Titre",
  enterTitle: "Saisissez un titre pour ce flux.",
  opensOnSite: "S'ouvre sur son site",
  clearingHint: "Décocher toutes les cases désabonne de ce flux.",
  saveFeedFailed: ({ message }) => `Impossible d'enregistrer ce flux. ${message}`,

  addNewsletterTitle: "Ajouter une newsletter",
  newsletterStep1: "Étape 1 sur 2 · obtenir une adresse",
  newsletterStep2: "Étape 2 sur 2 · la nommer et choisir où elle arrive",
  generateAddress: "Générer une adresse",
  copy: "Copier",
  copied: "Copiée",
  copyFailed: "Impossible de copier. Sélectionnez l'adresse et copiez-la à la main.",
  createAddressFailed: ({ message }) => `Impossible de créer une adresse. ${message}`,
  subscribeNewsletterFailed: ({ message }) =>
    `Impossible de s'abonner à cette newsletter. ${message}`,

  addFeedTitle: "Ajouter un flux",
  feedStep1: "Étape 1 sur 2 · trouver le flux",
  feedStep2: "Étape 2 sur 2 · choisir où il arrive",
  feedUrlLabel: "URL du flux ou du site",
  searching: "Recherche…",
  resultCount: ({ count }) =>
    frPlural({
      count,
      one: (n) => `${n} résultat`,
      other: (n) => `${n} résultats`,
    }),
  enterUrl: "Saisissez l'URL d'un flux ou d'un site.",
  lookupFailed: ({ message }) => `Impossible de rechercher cette URL. ${message}`,
  subscribeFeedFailed: ({ message }) => `Impossible de s'abonner à ce flux. ${message}`,
  results: "Résultats",
  pickCategory: "Choisissez au moins une catégorie pour ce flux.",
} satisfies Messages<typeof en>;
