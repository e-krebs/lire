---
name: empty-state-art
description: Make, edit or review empty-state scenes with Codex. Use when adding a scene to or changing an existing scene in art/empty-state/ or src/client/assets/empty/, or when briefing Codex for a new run or a feedback round.
---

# Empty-state art with Codex

The steps to add a scene are in
[docs/how-to/add-an-empty-state-scene.md](../../../docs/how-to/add-an-empty-state-scene.md). Editing
an existing scene follows the same steps minus the registration ones, see
[Edit an existing scene](#edit-an-existing-scene). This skill holds only the agent parts. The shipped style is `art/empty-state/colour/`; the ink style in
`art/empty-state/ink/` is archived, see [its notes](../../../art/empty-state/ink/NOTES.md).

## New run

```sh
codex exec --skip-git-repo-check -C . --sandbox workspace-write \
  -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=high \
  "<prompt>" -i <image> < /dev/null > log 2>&1
```

The prompt comes before `-i`. Put a time budget in the brief and tell Codex to render early, so the
folder always holds a complete set.

## Feedback round

Resume the session, after a backup of the folder:

```sh
codex exec resume --skip-git-repo-check -c sandbox_mode='"workspace-write"' \
  -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=high \
  <SESSION_ID> "<prompt>" < /dev/null > log 2>&1
```

When two runs go at once, give each Codex session its own folder.

## Edit an existing scene

Brief Codex the same way as for a new run, in a new folder such as `art/empty-state/colour-round2/`
holding copies of `tiles.html` and `capture.py`. Never let Codex edit `colour/` directly. Then:

- Name each scene in the brief with what changes, and say what stays (props, palette, camera).
- Tell Codex where the code lives. `tiles.html` has two render scopes: `render10Scenes` (the
  first ten scenes, `hammock` to `beach`) and `render6Scenes` (the rest). Each scope has its own
  copy of the shared helpers, and some scenes have an unused duplicate in the other scope. Edit
  the copy in the scope that `sceneDefinitions` uses.
- Ask for one shared helper when two scenes must match, for example the saddle of `bike-cafe` and
  `bike-canal`.
- Keep the geometry checks in `capture.py` passing, and update an assertion only when the change
  makes it obsolete.
- When the run is approved, copy the changed `tiles.html` and `capture.py` back into `colour/`,
  convert only the changed scenes to WebP, and update `colour/NOTES.md`. Skip `EMPTY_SCENES`,
  because the names are unchanged. Delete the round folder.

## Review checklist

- No people, only what was left behind.
- One or two hero objects.
- Reads at 320 × 200.
- The camera on the hex axis at 60°.
- Ink only: one accent per image, yellow `#fcd34d` or blue `#7fb2e5`.

## Brief template

```md
# Brief: <n> new and <m> reworked scenes in the colour style

## Context

Lire is a web feed reader. When a list of articles is empty, the app shows a small illustration
above the text "Nothing to read here." The set has the theme "doing nothing". No people appear.
Each scene shows what a person left behind while they went off to do nothing.

Read `art/empty-state/colour/tiles.html` and `NOTES.md` first. Do not change them. Work in a new
folder and do not touch other agents' folders.

## The new scenes

<scene table: Name | New or change>

## Style

Match the approved colour set exactly: the hex tile with its thick layered base, the chunky
flat-shaded low-poly shapes, the pastel palette, the camera, the day and dusk lights, the light
shadows with clean edges and the light tilt-shift. Reuse its parts where they fit. Each object must
read at once at 320x200: one or two hero objects per tile, few small props.

## Deliverables

- `tiles.html` copied from the colour set with the new scenes added.
- `<name>-light.png` and `<name>-dark.png` at 960x600, transparent background.
- `review-320.png`, a contact sheet at 320x200 on #f1f3f4 (light) and #1f1f1f (dark).
- `NOTES.md`, written first and updated as you go.

Capture with `capture.py` and the Chrome Headless Shell binary. Look at each image at full size and
at 320x200. You have about <n> minutes: render everything early, then polish.
```
