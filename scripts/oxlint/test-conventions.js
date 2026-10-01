const DESCRIBE_MODIFIERS = ["skip", "only", "concurrent", "serial", "parallel", "fixme"];

const QUERY_METHOD_RE = /^(get|query|find)(All)?By/;

function flattenMemberChain(node) {
  if (node.type === "Identifier") return [node.name];
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    const objectChain = flattenMemberChain(node.object);
    if (!objectChain) return null;
    return [...objectChain, node.property.name];
  }
  return null;
}

function chainEquals(chain, expected) {
  return chain.length === expected.length && chain.every((name, index) => name === expected[index]);
}

// Returns the title-argument node of `node` when it is a describe call
// (`describe`, `test.describe`, a modifier such as `.skip`, or `.each(...)`),
// or `undefined` when it is not a describe call, or is a title-less call
// such as `test.describe.configure(...)`.
function getDescribeTitleArg(node) {
  if (node.type !== "CallExpression") return undefined;

  if (node.callee.type === "CallExpression") {
    const chain = flattenMemberChain(node.callee.callee);
    if (!chain || chain.length < 2 || chain[chain.length - 1] !== "each") {
      return undefined;
    }
    const base = chain.slice(0, -1);
    if (chainEquals(base, ["describe"]) || chainEquals(base, ["test", "describe"])) {
      return node.arguments[0];
    }
    return undefined;
  }

  const chain = flattenMemberChain(node.callee);
  if (!chain) return undefined;

  if (chainEquals(chain, ["describe"]) || chainEquals(chain, ["test", "describe"])) {
    return node.arguments[0];
  }

  const last = chain[chain.length - 1];
  const base = chain.slice(0, -1);
  if (
    DESCRIBE_MODIFIERS.includes(last) &&
    (chainEquals(base, ["describe"]) || chainEquals(base, ["test", "describe"]))
  ) {
    return node.arguments[0];
  }

  return undefined;
}

function titleStartsWithWhen(titleArg) {
  if (!titleArg) return false;
  if (titleArg.type === "Literal" && typeof titleArg.value === "string") {
    return titleArg.value.startsWith("when ");
  }
  if (titleArg.type === "TemplateLiteral" && titleArg.quasis.length > 0) {
    const first = titleArg.quasis[0].value;
    const text = first.cooked ?? first.raw;
    return typeof text === "string" && text.startsWith("when ");
  }
  return false;
}

function isQueryMemberCall(node) {
  if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") {
    return false;
  }
  const { object, property, computed } = node.callee;
  if (computed || property.type !== "Identifier") return false;

  if (object.type === "Identifier" && (object.name === "screen" || object.name === "view")) {
    return QUERY_METHOD_RE.test(property.name);
  }

  if (object.type === "Identifier" && object.name === "page") {
    return QUERY_METHOD_RE.test(property.name) || property.name === "locator";
  }

  if (
    object.type === "CallExpression" &&
    object.callee.type === "Identifier" &&
    object.callee.name === "within"
  ) {
    return QUERY_METHOD_RE.test(property.name);
  }

  return false;
}

function isGetterOrMethodProperty(node) {
  return node.type === "Property" && (node.kind === "get" || node.method === true);
}

/** @type {import("oxlint").Plugin} */
export default {
  meta: { name: "test-conventions" },
  rules: {
    "nested-describe-when": {
      meta: {
        type: "problem",
        docs: {
          description:
            "A describe nested inside another describe must have a title starting with 'when '.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            const titleArg = getDescribeTitleArg(node);
            if (titleArg === undefined) return;

            const ancestors = context.sourceCode.getAncestors(node);
            const isNested = ancestors.some(
              (ancestor) => getDescribeTitleArg(ancestor) !== undefined,
            );
            if (!isNested) return;

            if (!titleStartsWithWhen(titleArg)) {
              context.report({
                node: titleArg ?? node,
                message:
                  "A nested describe's title must be a string or template literal starting with 'when '. See docs/reference/testing.md.",
              });
            }
          },
        };
      },
    },
    "queries-in-getters": {
      meta: {
        type: "problem",
        docs: {
          description:
            "screen/view/within/page queries must sit inside a getter or method of a ui object.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (!isQueryMemberCall(node)) return;

            const ancestors = context.sourceCode.getAncestors(node);
            const inGetterOrMethod = ancestors.some(isGetterOrMethodProperty);
            if (inGetterOrMethod) return;

            context.report({
              node,
              message:
                "Queries must live in a ui object's getter or method. See docs/reference/testing.md.",
            });
          },
        };
      },
    },
  },
};
