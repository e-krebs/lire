# Code conventions

How `src/client` is laid out and which rules a linter checks. Test style lives in
[testing.md](testing.md).

## Components

Components live in theme folders under `src/client/components`: `shell` (app frame, top bar,
tooltip), `navigation` (navigator, location bar, view toggles), `articles` (mosaic, tiles, undo,
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
`hooks/utils`. Pure functions go in `src/client/utils`. A lint rule checks the hook file names.

## Stories

A story sits in a `__stories__` folder next to its component, like tests in `__tests__`. Keep one
`Default` story per component and put states behind args and controls: do not add near-identical
stories. A callback gets `fn()` and `control: false`. A prop the component does not use is not a
control. Shared decorators and fixtures are in `.storybook` and imported as `stories/...`.

Storybook keeps running on port 6006. To restart it, kill by port (`kill $(lsof -ti :6006)`), not
by process name, or a stale server serves an old tsconfig.
