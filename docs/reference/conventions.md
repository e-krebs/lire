# Code conventions

How `src/client` is laid out and which rules a linter checks. Test style lives in
[testing.md](testing.md).

## Components

Components live in theme folders under `src/client/components`: `shell` (app frame, top bar,
tooltip), `navigation` (navigator, location bar, view toggles), `articles` (mosaic, tiles,
refresh), `reader`, `subscriptions` and `ui` (small shared controls, icons). A new component goes
in the folder of the screen area it serves, not in a new top-level file.

A component with parts of its own becomes a folder: one file per component, a `shared.ts` for
class names and constants used by several files, and a constant used by one file stays in that
file. A folder with one public export holds the component in `index.tsx`. A folder with several
public exports gets an `index.ts` barrel, one file per export. A lint rule rejects an `index.ts`
that re-exports a single value.

A component never defines JSX in a variable or a render helper inside another component. Make it
a component with props. A lint rule checks this in `src/client`, tests and stories excluded. An
exception takes an `oxlint-disable-next-line` with the reason.

## UI strings

Every user-facing string lives in the catalog under `src/client/i18n/messages/`, one file per UI
area (`common`, `shell`, `subscriptions`, `navigation`, `articles`), and a component reads it with
`const t = useT()`.

- Add the key to the area file's `en` and `fr` together. `en` is the source of truth and `fr`
  is declared `satisfies Messages<typeof en>`, so a missing or mistyped French key fails the
  type check.
- A message is a string, or a function of one object argument: `({ count, label }) => ...`.
- A count uses the area file's `plural`, bound once with `pluralFor("en")` or `pluralFor("fr")`:
  `plural({ count, one, other })`, where `one` and `other` are functions of `count`. The CLDR rules
  of `Intl.PluralRules` pick the form, so French reads 0 as singular.
- `common.ts` holds the shared verbs. A word another area needs keeps its own copy in that area's
  file.
- `time.ts` keeps its few fixed words in a per-locale map, so the util does not import the catalog.
- Never translated: feed titles, category labels, article content, profile fields, and
  `error.message` from the server or from `src/client/api`. The dev-only `routes/dev.*.tsx` pages
  stay English.
- French uses a neutral register: infinitives and noun labels, with `vous` only where a pronoun is
  needed. It writes the typographic apostrophe `'` and the single ellipsis character `…`.

A lint rule rejects raw text in JSX ([tooling.md](../explanation/tooling.md#custom-lint-plugins)).
Formatters take the active locale, cached per locale.

## Conditional styles

Style from state through attributes, not through class ternaries on JS values.

- Set a `data-*` attribute (`data-busy`, `data-empty`, `data-has-rest`) or use an existing one
  (`aria-busy`, `data-read`) and style with `data-busy:`, `group-aria-busy:` and the like.
- The app bar position is `<html data-bar>`. Use the `bar-bottom:` variant from `styles.css`.
- Only a CSS custom property carries a continuous value (a hue, a size).
- A ternary stays when it changes the content, the element order or the label, not just classes.

## Tier variants

Layout adapts in CSS. When a component needs a different wrapper per tier (`useTier`), the wrapper
changes and the content stays: React remounts a subtree when its root element type changes, so
the common content goes through `useReparentedContent` and each wrapper renders the slot.
`SidePanel` and `Navigator` are the reference.

## Hooks and utils

`src/client/hooks` holds hooks only, each file named `useXxx`. A helper a hook needs goes in
`hooks/utils`. Pure functions go in `src/client/utils`, such as `embeds.ts`, which checks and builds
the YouTube and X frame sources. A lint rule checks the hook file names.

## Stories

A story sits in a `__stories__` folder next to its component, like tests in `__tests__`. Keep one
`Default` story per component and put states behind args and controls: do not add near-identical
stories. A callback gets `fn()` and `control: false`. A prop the component does not use is not a
control. Shared decorators and fixtures are in `.storybook` and imported as `stories/...`.

Storybook keeps running on port 6006. To restart it, kill by port (`kill $(lsof -ti :6006)`), not
by process name, or a stale server serves an old tsconfig.
