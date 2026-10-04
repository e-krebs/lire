# Empty-state art

Sources for the "doing nothing" scenes shown above an empty article list.

| Folder | Status | Holds |
| --- | --- | --- |
| [colour/](colour/NOTES.md) | Ships. The WebP files in `src/client/assets/empty/` are its renders. | `tiles.html` (three.js scenes), `capture.py`, `NOTES.md` |
| [ink/](ink/NOTES.md) | Archived, not used by the app. | The same files, plus the 32 renders and a contact sheet as WebP |

Nothing here is part of the build: `art/` is outside `tsconfig.json`, `knip.json` and Vite.

To add a scene, follow [the how-to](../../docs/how-to/add-an-empty-state-scene.md). To brief an
agent on it, use the [empty-state-art skill](../../.claude/skills/empty-state-art/SKILL.md).
