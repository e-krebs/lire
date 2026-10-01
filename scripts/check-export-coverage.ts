import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

type Position = { line: number };
type FnEntry = { name: string; decl: { start: Position }; loc: { start: Position } };
type FileCoverage = { path: string; fnMap: Record<string, FnEntry>; f: Record<string, number> };
type Export = { name: string; line: number; matchLines: number[] };

const DEFAULT_DIRS = ["coverage/client", "coverage/server"];

const FUNCTION_DECL = /^export (?:async )?function\*? ?(\w+)/;
const DEFAULT_FUNCTION = /^export default (?:async )?function\*?(?: (\w+))?/;
const VALUE_HEAD = /^export (?:const (\w+)(?:: .*?)? =|default)(?: (.*))?$/;
const FUNCTION_VALUE = /^(?:async\b|function\b|<.*>\s*\(|\(|\w+ =>)/;
const WRAPPED_VALUE = /^(?:forwardRef|memo)(?:<.*>)?\((.*)$/;
const INLINE_ARGUMENT = /^(?:\(|function\b)/;

// Exported class methods are out of scope: only top-level function exports are checked.
const findExports = (source: string): Export[] => {
  const lines = source.split("\n");
  return lines.flatMap((text, index): Export[] => {
    const line = index + 1;
    const declared = FUNCTION_DECL.exec(text) ?? DEFAULT_FUNCTION.exec(text);
    if (declared) return [{ name: declared[1] ?? "default", line, matchLines: [line] }];

    const head = VALUE_HEAD.exec(text);
    if (!head) return [];
    // oxfmt breaks a long `export const X =` so the value starts on the next line.
    const [value, valueLine] =
      head[2] === undefined ? [(lines[index + 1] ?? "").trim(), line + 1] : [head[2], line];
    const name = head[1] ?? "default";
    if (FUNCTION_VALUE.test(value)) return [{ name, line: valueLine, matchLines: [valueLine] }];
    const wrapped = WRAPPED_VALUE.exec(value);
    if (!wrapped) return [];
    // A long wrapper call is broken the same way, and v8 maps its function to either line.
    const [argument, argumentLines] =
      wrapped[1] === ""
        ? [(lines[valueLine] ?? "").trim(), [valueLine, valueLine + 1]]
        : [wrapped[1], [valueLine]];
    // A wrapper around a reference (`memo(Inner)`) has no function of its own to match.
    const matchLines = INLINE_ARGUMENT.test(argument) ? argumentLines : [];
    return [{ name, line: valueLine, matchLines }];
  });
};

const findEntry = ({ coverage, exp }: { coverage: FileCoverage; exp: Export }) => {
  return Object.entries(coverage.fnMap).find(
    ([, fn]) =>
      exp.matchLines.includes(fn.decl.start.line) || exp.matchLines.includes(fn.loc.start.line),
  );
};

const dirs = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_DIRS;
const problems: string[] = [];

for (const dir of dirs) {
  const report = join(dir, "coverage-final.json");
  if (!existsSync(report)) {
    problems.push(`${report} missing`);
    continue;
  }
  const files = JSON.parse(readFileSync(report, "utf8")) as Record<string, FileCoverage>;
  for (const coverage of Object.values(files)) {
    const path = relative(process.cwd(), coverage.path);
    for (const exp of findExports(readFileSync(coverage.path, "utf8"))) {
      const entry = findEntry({ coverage, exp });
      if (!entry) problems.push(`${path}:${exp.line} ${exp.name} no fnMap entry`);
      else if (coverage.f[entry[0]] === 0) problems.push(`${path}:${exp.line} ${exp.name}`);
    }
  }
}

for (const problem of problems) console.log(problem);
if (problems.length) process.exit(1);
