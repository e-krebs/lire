import type { Locale } from "./locale";
import type { Messages } from "./types";
import * as articles from "./messages/articles";
import * as common from "./messages/common";
import * as navigation from "./messages/navigation";
import * as shell from "./messages/shell";
import * as subscriptions from "./messages/subscriptions";

// Spelled out so `fr`, typed against `en`'s shape, stays assignable.
type Catalog = {
  common: Messages<typeof common.en>;
  shell: Messages<typeof shell.en>;
  subscriptions: Messages<typeof subscriptions.en>;
  navigation: Messages<typeof navigation.en>;
  articles: Messages<typeof articles.en>;
};

export const catalogs: Record<Locale, Catalog> = {
  en: {
    common: common.en,
    shell: shell.en,
    subscriptions: subscriptions.en,
    navigation: navigation.en,
    articles: articles.en,
  },
  fr: {
    common: common.fr,
    shell: shell.fr,
    subscriptions: subscriptions.fr,
    navigation: navigation.fr,
    articles: articles.fr,
  },
};
