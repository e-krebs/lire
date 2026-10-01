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
  },
};
