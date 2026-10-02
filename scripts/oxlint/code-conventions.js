const HOOK_FILE_RE = /\/src\/client\/hooks\/(?!utils\/|__tests__\/)(?:.*\/)?([^/]+)$/;
const HOOK_NAME_RE = /^use[A-Z][A-Za-z0-9]*\.tsx?$/;

const isJsx = (node) => node?.type === "JSXElement" || node?.type === "JSXFragment";
const isFunction = (node) =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

const returnsJsx = (fn) => {
  if (isJsx(fn.body)) return true;
  if (fn.body.type !== "BlockStatement") return false;
  return fn.body.body.some(
    (statement) => statement.type === "ReturnStatement" && isJsx(statement.argument),
  );
};

const TEXT_ATTRIBUTES = new Set(["aria-label", "title", "placeholder", "alt", "label", "data-tip"]);
const ALLOWED_TEXT = new Set(["Lire"]);

const staticText = (node) => {
  if (node?.type === "Literal") return typeof node.value === "string" ? node.value : null;
  if (node?.type === "TemplateLiteral")
    return node.quasis.map((quasi) => quasi.value.cooked).join("");
  return null;
};

const isUserText = (text) => {
  const trimmed = text?.trim();
  return Boolean(trimmed) && /\p{L}/u.test(trimmed) && !ALLOWED_TEXT.has(trimmed);
};

export default {
  meta: { name: "code-conventions" },
  rules: {
    "hook-file-name": {
      meta: {
        type: "problem",
        docs: { description: "Files in src/client/hooks are useXxx; helpers go in hooks/utils." },
      },
      create(context) {
        return {
          Program(node) {
            const match = HOOK_FILE_RE.exec(context.filename);
            if (match && !HOOK_NAME_RE.test(match[1])) {
              context.report({
                node,
                message:
                  "Files in hooks/ must be named useXxx. Move non-hook helpers to hooks/utils. See docs/reference/conventions.md.",
              });
            }
          },
        };
      },
    },
    "no-render-helper": {
      meta: {
        type: "problem",
        docs: {
          description:
            "No lowercase const holding JSX, or a function returning JSX, in a function.",
        },
      },
      create(context) {
        return {
          VariableDeclarator(node) {
            if (node.id.type !== "Identifier" || !node.init) return;
            if (!/^[a-z]/.test(node.id.name)) return;
            const holdsJsx = isJsx(node.init) || (isFunction(node.init) && returnsJsx(node.init));
            if (!holdsJsx) return;
            const insideFunction = context.sourceCode.getAncestors(node).some(isFunction);
            if (!insideFunction) return;
            context.report({
              node,
              message: `\`${node.id.name}\` holds JSX inside a component. Make it a component. See docs/reference/conventions.md.`,
            });
          },
        };
      },
    },
    "barrel-needs-several-exports": {
      meta: {
        type: "problem",
        docs: { description: "An index.ts re-exporting one value holds that code in index.tsx." },
      },
      create(context) {
        return {
          Program(node) {
            if (!context.filename.endsWith("/index.ts")) return;
            const values = node.body.filter(
              (statement) =>
                (statement.type === "ExportNamedDeclaration" ||
                  statement.type === "ExportAllDeclaration") &&
                statement.exportKind !== "type",
            );
            const count = values.reduce(
              (sum, statement) => sum + (statement.specifiers?.length || 1),
              0,
            );
            if (count === 1) {
              context.report({
                node,
                message:
                  "A barrel exports several values. With one export, put the code in index.tsx. See docs/reference/conventions.md.",
              });
            }
          },
        };
      },
    },
    "no-raw-jsx-text": {
      meta: {
        type: "problem",
        docs: { description: "User-facing JSX text comes from the i18n catalog." },
      },
      create(context) {
        const report = (node) =>
          context.report({
            node,
            message:
              "Raw text in JSX. Move it to src/client/i18n/messages/ and read it through useT. See docs/reference/conventions.md.",
          });
        return {
          JSXText(node) {
            if (isUserText(node.value)) report(node);
          },
          JSXAttribute(node) {
            if (node.name.type !== "JSXIdentifier" || !TEXT_ATTRIBUTES.has(node.name.name)) return;
            const value =
              node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
            if (isUserText(staticText(value))) report(node);
          },
          JSXExpressionContainer(node) {
            if (node.parent?.type !== "JSXElement" && node.parent?.type !== "JSXFragment") return;
            if (isUserText(staticText(node.expression))) report(node);
          },
        };
      },
    },
  },
};
