# 0010. Translate the UI with an in-house typed catalog

## Status

Accepted

## Context

The UI has two locales, English and French, and about 140 strings. Relative times already followed
the browser and showed French inside an English UI. The app is small and has no server-side
rendering. Three options:

- i18next with react-i18next: mature, with ICU-style plurals and lazy loading, but a runtime, a
  provider and string keys that a typo breaks only at run time.
- Lingui: compile-time extraction and ICU messages, but a build step and a toolchain plugin for two
  languages.
- In-house: a typed object per language and the platform's `Intl`.

## Decision

An in-house catalog plus `Intl`. A catalog file per UI area holds `en` and `fr` side by side. A
message is a string or a function of one object argument. `en` is the source of truth and `fr` must
satisfy its type. Components read a plain nested object through `useT()`. The locale is a
`useSyncExternalStore` store, from `navigator.languages` unless the account menu stores an override.
Plurals go through `Intl.PluralRules`, and every date and list formatter takes the active locale. A
lint rule rejects raw text in JSX.

## Consequences

- No ICU message syntax. A message that varies is a function.
- Plurals follow the CLDR rules of `Intl.PluralRules`, so French counts 0 as singular.
- A missing or mistyped key fails the type check, and a catalog test calls every message.
- A third locale costs one more value per area file and one more union member, and no new tooling.
- No lazy loading: both languages ship in the main bundle.
- Strings built outside JSX rely on review, because the lint rule covers JSX only.
- Feed and server text stays as it arrives, and the manifest, `index.html` and Android strings stay
  English.
- Detail: [architecture](../explanation/architecture.md) and
  [conventions](../reference/conventions.md#ui-strings).
