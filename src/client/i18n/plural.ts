import type { Locale } from "./locale";

interface PluralForms {
  count: number;
  one: (count: number) => string;
  other: (count: number) => string;
}

const rulesByLocale = new Map<Locale, Intl.PluralRules>();

const rulesFor = (locale: Locale): Intl.PluralRules => {
  let rules = rulesByLocale.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    rulesByLocale.set(locale, rules);
  }
  return rules;
};

// French reads 0 as singular, so the CLDR rules pick the form, not `count === 1`.
/** @public Bound once per message area. */
export const pluralFor =
  (locale: Locale) =>
  ({ count, one, other }: PluralForms): string =>
    (rulesFor(locale).select(count) === "one" ? one : other)(count);
