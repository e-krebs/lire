import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PREVIEW = ".storybook/preview.tsx";
const STORIES_ROOT = "src";
const COMPONENTS = "src/client/components/";
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const sentenceCase = (kebab: string) => {
  const words = kebab.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const errors: string[] = [];

const blankComments = (src: string): string => {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else {
      out += c;
      i++;
    }
  }
  return out;
};

const parseOrder = (): Map<string, string[]> | undefined => {
  const text = blankComments(readFileSync(PREVIEW, "utf8"));
  const start = text.indexOf("order: [");
  if (start === -1) {
    errors.push(`${PREVIEW}: no inline "order: [" literal found`);
    return undefined;
  }
  const tokens = [...text.slice(start + "order: ".length).matchAll(/"([^"]*)"|([[\],])/g)];
  const order = new Map<string, string[]>();
  let depth = 0;
  let root: string | undefined;
  let arrays = 0;
  for (const [, str, punct] of tokens) {
    if (str !== undefined) {
      if (depth === 1) {
        if (root !== undefined && arrays === 0) {
          errors.push(`${PREVIEW}: root "${root}" is not followed by an array of groups`);
        }
        if (order.has(str)) errors.push(`${PREVIEW}: duplicate root "${str}" in order`);
        root = str;
        arrays = 0;
        order.set(str, []);
      } else if (depth === 2 && root !== undefined && arrays === 1) {
        const groups = order.get(root) ?? [];
        if (groups.includes(str))
          errors.push(`${PREVIEW}: duplicate group "${root}/${str}" in order`);
        groups.push(str);
      }
    } else if (punct === "[") {
      depth++;
      if (depth === 2) {
        if (root === undefined) errors.push(`${PREVIEW}: group array before any root`);
        else if (++arrays > 1)
          errors.push(`${PREVIEW}: root "${root}" is followed by more than one group array`);
      } else if (depth > 2) {
        errors.push(`${PREVIEW}: nested array under root "${root}", groups must be flat`);
      }
    } else if (punct === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (root !== undefined && arrays === 0) {
    errors.push(`${PREVIEW}: root "${root}" is not followed by an array of groups`);
  }
  return order;
};

const order = parseOrder();
const used = new Map<string, Set<string>>();
const titles = new Map<string, string>();

const stories = walk(STORIES_ROOT)
  .filter((f) => /\/__stories__\/[^/]+\.stories\.tsx$/.test(f))
  .sort();

for (const file of stories) {
  const text = readFileSync(file, "utf8");
  const defaults = text.match(/^export default\b.*$/gm) ?? [];
  const inline = defaults.length === 1 && /^export default\s*\{/.test(defaults[0]);
  if (defaults.length !== 1 || (!inline && defaults[0].trim() !== "export default meta;")) {
    errors.push(`${file}: expected a single "export default meta;" or inline "export default {"`);
    continue;
  }
  const metaStart = text.search(inline ? /^export default\s*\{/m : /^const meta\b.*=\s*\{/m);
  const metaEnd = text.indexOf("\n}", metaStart);
  const meta = metaStart === -1 || metaEnd === -1 ? "" : text.slice(metaStart, metaEnd);
  const found = [...meta.matchAll(/^ {2}title:\s*([^\n]*)/gm)];
  if (found.length !== 1) {
    errors.push(`${file}: expected exactly one top-level title, found ${found.length}`);
    continue;
  }
  const plain = /^"([^"\\]*)",?$/.exec(found[0][1].trim());
  if (!plain) {
    errors.push(`${file}: title is not a plain quoted string`);
    continue;
  }
  const title = plain[1];

  const match = file.startsWith(COMPONENTS)
    ? /^([^/]+)\/([^/]+)\/__stories__\/([^/]+)\.stories\.tsx$/.exec(file.slice(COMPONENTS.length))
    : null;
  if (!match) {
    errors.push(`${file}: a story must sit at ${COMPONENTS}<root>/<group>/__stories__/`);
    continue;
  }
  const [, root, group, leaf] = match;
  if (!KEBAB.test(root) || !KEBAB.test(group)) {
    errors.push(
      `${file}: root and group folders must be lowercase kebab-case (got ${root}, ${group})`,
    );
    continue;
  }
  const expected = `${sentenceCase(root)}/${sentenceCase(group)}/${leaf}`;
  if (title !== expected) errors.push(`${file}: title "${title}" should be "${expected}"`);

  const [titleRoot, titleGroup] = [sentenceCase(root), sentenceCase(group)];
  if (order) {
    const groups = order.get(titleRoot);
    if (!groups)
      errors.push(`${file}: root "${titleRoot}" is missing from the order in ${PREVIEW}`);
    else if (!groups.includes(titleGroup)) {
      errors.push(
        `${file}: group "${titleRoot}/${titleGroup}" is missing from the order in ${PREVIEW}`,
      );
    }
  }
  used.set(titleRoot, (used.get(titleRoot) ?? new Set()).add(titleGroup));

  const other = titles.get(title);
  if (other) errors.push(`${file}: title "${title}" is already used by ${other}`);
  else titles.set(title, file);
}

if (order) {
  for (const [root, groups] of order) {
    if (!used.has(root)) errors.push(`${PREVIEW}: root "${root}" has no story`);
    for (const group of groups) {
      if (!used.get(root)?.has(group))
        errors.push(`${PREVIEW}: group "${root}/${group}" has no story`);
    }
  }
}

if (errors.length) {
  console.error(`Story order gate: ${errors.length} problem(s):\n${errors.join("\n")}`);
  process.exit(1);
}
console.log(`story order gate: ${stories.length} stories, ${order?.size ?? 0} roots clean`);
