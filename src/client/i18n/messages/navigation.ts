import { pluralFor } from "client/i18n/plural";
import type { Messages } from "client/i18n/types";

const enPlural = pluralFor("en");
const frPlural = pluralFor("fr");

export const en = {
  navigator: "Navigator",
  location: "Location",
  openNavigator: "Open navigator",
  viewGroup: "View",
  unreadOnly: "Unread only",
  showAllArticles: "Show all articles",
  showUnreadOnly: "Show unread only",
  oldestFirst: "Oldest first",
  newestFirst: "Newest first",
  searchNewestFirst: "Search results are newest first",
  searchScoped: "Search articles, feeds…",
  searchAll: "Search all articles, feeds…",
  searchArticlesAndFeeds: "Search articles and feeds",
  clearSearchText: "Clear search text",
  edit: ({ label }: { label: string }) => `Edit ${label}`,
  searchEverywhere: "Search everywhere",
  searchEverywhereInstead: ({ label }: { label: string }) =>
    `Search everywhere instead of ${label}`,
  toggle: ({ label }: { label: string }) => `Toggle ${label}`,
  expand: "Expand",
  collapse: "Collapse",
  searchArticlesFor: ({ query }: { query: string }) => `Search articles for “${query}”`,
  inScope: ({ label }: { label: string }) => `in ${label}`,
  loadingCategories: "Loading categories",
  allArticles: "All articles",
  all: "All",
  matchCount: ({ count }: { count: number }) =>
    enPlural({ count, one: (n) => `${n} article`, other: (n) => `${n} articles` }),
  matchCountOrMore: ({ count }: { count: number }) =>
    enPlural({
      count,
      one: (n) => `${n} or more articles`,
      other: (n) => `${n} or more articles`,
    }),
  recentlyRead: "Recently read",
  matches: "Matches",
  noMatches: ({ query }: { query: string }) => `No feeds or categories match “${query}”.`,
  manageSubscriptions: "Manage subscriptions",
} as const;

export const fr = {
  navigator: "Navigation",
  location: "Emplacement",
  openNavigator: "Ouvrir la navigation",
  viewGroup: "Affichage",
  unreadOnly: "Non lus uniquement",
  showAllArticles: "Afficher tous les articles",
  showUnreadOnly: "Afficher les non lus uniquement",
  oldestFirst: "Plus anciens d'abord",
  newestFirst: "Plus récents d'abord",
  searchNewestFirst: "Les résultats de recherche sont triés du plus récent au plus ancien",
  searchScoped: "Rechercher des articles, des flux…",
  searchAll: "Rechercher dans tous les articles, flux…",
  searchArticlesAndFeeds: "Rechercher des articles et des flux",
  clearSearchText: "Effacer la recherche",
  edit: ({ label }) => `Modifier ${label}`,
  searchEverywhere: "Rechercher partout",
  searchEverywhereInstead: ({ label }) => `Rechercher partout plutôt que dans ${label}`,
  toggle: ({ label }) => `Basculer ${label}`,
  expand: "Développer",
  collapse: "Réduire",
  searchArticlesFor: ({ query }) => `Rechercher des articles pour « ${query} »`,
  inScope: ({ label }) => `dans ${label}`,
  loadingCategories: "Chargement des catégories",
  allArticles: "Tous les articles",
  all: "Tout",
  matchCount: ({ count }) =>
    frPlural({ count, one: (n) => `${n} article`, other: (n) => `${n} articles` }),
  matchCountOrMore: ({ count }) =>
    frPlural({
      count,
      one: (n) => `${n} article ou plus`,
      other: (n) => `${n} articles ou plus`,
    }),
  recentlyRead: "Lus récemment",
  matches: "Correspondances",
  noMatches: ({ query }) => `Aucun flux ni catégorie ne correspond à « ${query} ».`,
  manageSubscriptions: "Gérer les abonnements",
} satisfies Messages<typeof en>;
