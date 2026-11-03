import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { Plugin, ResolvedConfig } from "vite";

const MODULE_ID = "virtual:empty-sprites";
const RESOLVED_ID = `\0${MODULE_ID}`;
const DEV_PREFIX = "/__empty-sprites/";
const SCENES_DIR = fileURLToPath(new URL("../../src/client/assets/empty", import.meta.url));
// Half the source size (2x the 320 px display): a full-size sheet decodes to about 115 MiB.
const CELL = { width: 640, height: 400 };
const COLS = 5;
const SHEETS = [
  { phase: "day", suffix: "light" },
  { phase: "dusk", suffix: "dark" },
] as const;

type Phase = (typeof SHEETS)[number]["phase"];

const listScenes = async (): Promise<string[]> =>
  (await readdir(SCENES_DIR))
    .filter((file) => file.endsWith("-light.webp"))
    .map((file) => file.replace(/-light\.webp$/, ""))
    .sort();

const buildSheet = async ({ scenes, suffix }: { scenes: string[]; suffix: string }) => {
  const cells = await Promise.all(
    scenes.map((scene) =>
      sharp(path.join(SCENES_DIR, `${scene}-${suffix}.webp`))
        .resize(CELL.width, CELL.height)
        .toBuffer(),
    ),
  );
  return sharp({
    create: {
      width: COLS * CELL.width,
      height: Math.ceil(scenes.length / COLS) * CELL.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      cells.map((input, index) => ({
        input,
        left: (index % COLS) * CELL.width,
        top: Math.floor(index / COLS) * CELL.height,
      })),
    )
    .webp({ quality: 85, alphaQuality: 100 })
    .toBuffer();
};

// Packs the day and dusk scene WebPs into one sheet each, so production ships two files.
export function emptySprites(): Plugin {
  let config: ResolvedConfig;
  let version = 0;
  let sheets: Promise<{ scenes: string[]; buffers: Record<Phase, Buffer> }> | undefined;

  const getSheets = () => {
    sheets ??= (async () => {
      const scenes = await listScenes();
      const [day, dusk] = await Promise.all(
        SHEETS.map(({ suffix }) => buildSheet({ scenes, suffix })),
      );
      return { scenes, buffers: { day: day as Buffer, dusk: dusk as Buffer } };
    })();
    return sheets;
  };

  return {
    name: "lire:empty-sprites",
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        const phase = SHEETS.find(({ phase }) => url === `${DEV_PREFIX}${phase}.webp`)?.phase;
        if (!phase) return next();
        res.setHeader("Content-Type", "image/webp");
        res.end((await getSheets()).buffers[phase]);
      });
      server.watcher.add(SCENES_DIR);
      const refresh = (file: string) => {
        if (!file.startsWith(SCENES_DIR)) return;
        sheets = undefined;
        version += 1;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", refresh).on("change", refresh).on("unlink", refresh);
    },
    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const { scenes, buffers } = await getSheets();
      const urls = Object.fromEntries(
        SHEETS.map(({ phase }) => [
          phase,
          config.command === "build"
            ? `import.meta.ROLLUP_FILE_URL_${this.emitFile({
                type: "asset",
                name: `empty-${phase}.webp`,
                source: buffers[phase],
              })}`
            : JSON.stringify(`${DEV_PREFIX}${phase}.webp?v=${version}`),
        ]),
      );
      const cells = Object.fromEntries(scenes.map((scene, index) => [scene, index]));
      return `export default {
  cols: ${COLS},
  rows: ${Math.ceil(scenes.length / COLS)},
  cells: ${JSON.stringify(cells)},
  day: ${urls.day},
  dusk: ${urls.dusk},
};`;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        if (!ctx.bundle) return [];
        // Prefetch (idle priority), not preload: only an empty list needs the sheets.
        return Object.values(ctx.bundle)
          .filter(
            (file) => file.type === "asset" && /^assets\/empty-(day|dusk)-/.test(file.fileName),
          )
          .map((file) => ({
            tag: "link",
            attrs: {
              rel: "prefetch",
              as: "image",
              type: "image/webp",
              href: `${config.base}${file.fileName}`,
            },
            injectTo: "head" as const,
          }));
      },
    },
  };
}
