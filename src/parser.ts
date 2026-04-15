import Parser = require("tree-sitter");

export interface SemanticBlock {
  label: string;
  startLine: number; // 0-based
  endLine: number;   // 0-based, inclusive
  code: string;
  level: number;     // 0 = file overview, 1 = top-level block, 2 = class method
  parent?: string;   // label of the parent SemanticBlock (set for level-2 blocks)
}

/**
 * Parse a TypeScript or Python source string into semantic blocks using tree-sitter.
 * languageId must be one of: "typescript" | "typescriptreact" | "python"
 *
 * Returned block order (hierarchical):
 *   1. File Overview  (level 0) — synthetic, spans the whole file
 *   2. Imports group  (level 1)
 *   3. Top-level classes (level 1) immediately followed by their methods (level 2),
 *      interleaved with top-level functions (level 1) and top-level logic (level 1)
 *      in source order.
 */
export function parseBlocks(source: string, languageId = "typescript"): SemanticBlock[] {
  if (languageId === "python") {
    return parsePythonBlocks(source);
  }
  return parseTypeScriptBlocks(source);
}

// ---------------------------------------------------------------------------
// TypeScript parser
// ---------------------------------------------------------------------------

function parseTypeScriptBlocks(source: string): SemanticBlock[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TypeScript = require("tree-sitter-typescript").typescript;

  const parser = new Parser();
  parser.setLanguage(TypeScript);

  const tree = parser.parse(source);
  const lines = source.split("\n");

  const classEntries: Array<{ block: SemanticBlock; methods: SemanticBlock[] }> = [];
  const functionBlocks: SemanticBlock[] = [];
  const importLines: { start: number; end: number }[] = [];
  const otherTopLevelRanges: { start: number; end: number }[] = [];

  const topLevelNodes = tree.rootNode.children;

  for (const node of topLevelNodes) {
    const start = node.startPosition.row;
    const end = node.endPosition.row;
    const nodeCode = lines.slice(start, end + 1).join("\n");

    if (node.type === "import_statement") {
      importLines.push({ start, end });
      continue;
    }

    if (node.type === "class_declaration" || node.type === "abstract_class_declaration") {
      const nameNode = node.childForFieldName("name");
      const className = nameNode ? nameNode.text : "<anonymous>";
      const classBlock: SemanticBlock = {
        label: `Class: ${className}`,
        startLine: start,
        endLine: end,
        code: nodeCode,
        level: 1,
      };
      const methods = extractTsClassMethods(node, lines, className);
      classEntries.push({ block: classBlock, methods });
      continue;
    }

    if (node.type === "function_declaration") {
      const nameNode = node.childForFieldName("name");
      const fnName = nameNode ? nameNode.text : "<anonymous>";
      functionBlocks.push({
        label: `Function: ${fnName}`,
        startLine: start,
        endLine: end,
        code: nodeCode,
        level: 1,
      });
      continue;
    }

    if (
      node.type === "export_statement" ||
      node.type === "lexical_declaration" ||
      node.type === "variable_declaration"
    ) {
      const arrowOrFnName = extractArrowFunctionName(node);
      if (arrowOrFnName) {
        functionBlocks.push({
          label: `Function: ${arrowOrFnName}`,
          startLine: start,
          endLine: end,
          code: nodeCode,
          level: 1,
        });
        continue;
      }
    }

    if (node.type !== "comment" && start <= end) {
      otherTopLevelRanges.push({ start, end });
    }
  }

  return assembleBlocks(lines, classEntries, functionBlocks, importLines, otherTopLevelRanges);
}

// ---------------------------------------------------------------------------
// Python parser
// ---------------------------------------------------------------------------

function parsePythonBlocks(source: string): SemanticBlock[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Python = require("tree-sitter-python");

  const parser = new Parser();
  parser.setLanguage(Python);

  const tree = parser.parse(source);
  const lines = source.split("\n");

  const classEntries: Array<{ block: SemanticBlock; methods: SemanticBlock[] }> = [];
  const functionBlocks: SemanticBlock[] = [];
  const importLines: { start: number; end: number }[] = [];
  const otherTopLevelRanges: { start: number; end: number }[] = [];

  for (const node of tree.rootNode.children) {
    const start = node.startPosition.row;
    const end = node.endPosition.row;
    const nodeCode = lines.slice(start, end + 1).join("\n");

    // import foo  /  from foo import bar
    if (node.type === "import_statement" || node.type === "import_from_statement") {
      importLines.push({ start, end });
      continue;
    }

    // class Foo:
    if (node.type === "class_definition") {
      const nameNode = node.childForFieldName("name");
      const className = nameNode ? nameNode.text : "<anonymous>";
      const classBlock: SemanticBlock = {
        label: `Class: ${className}`,
        startLine: start,
        endLine: end,
        code: nodeCode,
        level: 1,
      };
      const methods = extractPyClassMethods(node, lines, className);
      classEntries.push({ block: classBlock, methods });
      continue;
    }

    // def foo():
    if (node.type === "function_definition") {
      const nameNode = node.childForFieldName("name");
      const fnName = nameNode ? nameNode.text : "<anonymous>";
      functionBlocks.push({
        label: `Function: ${fnName}`,
        startLine: start,
        endLine: end,
        code: nodeCode,
        level: 1,
      });
      continue;
    }

    // @decorator\nclass Foo:  or  @decorator\ndef foo():
    if (node.type === "decorated_definition") {
      const inner = node.children.find(
        (c) => c.type === "class_definition" || c.type === "function_definition"
      );
      if (inner) {
        const nameNode = inner.childForFieldName("name");
        const name = nameNode ? nameNode.text : "<anonymous>";
        if (inner.type === "class_definition") {
          const classBlock: SemanticBlock = {
            label: `Class: ${name}`,
            startLine: start,
            endLine: end,
            code: nodeCode,
            level: 1,
          };
          const methods = extractPyClassMethods(inner, lines, name);
          classEntries.push({ block: classBlock, methods });
        } else {
          functionBlocks.push({
            label: `Function: ${name}`,
            startLine: start,
            endLine: end,
            code: nodeCode,
            level: 1,
          });
        }
        continue;
      }
    }

    if (node.type !== "comment" && start <= end) {
      otherTopLevelRanges.push({ start, end });
    }
  }

  return assembleBlocks(lines, classEntries, functionBlocks, importLines, otherTopLevelRanges);
}

// ---------------------------------------------------------------------------
// Shared assembly
// ---------------------------------------------------------------------------

function assembleBlocks(
  lines: string[],
  classEntries: Array<{ block: SemanticBlock; methods: SemanticBlock[] }>,
  functionBlocks: SemanticBlock[],
  importLines: { start: number; end: number }[],
  otherTopLevelRanges: { start: number; end: number }[]
): SemanticBlock[] {
  const result: SemanticBlock[] = [];

  // ── Level 0: File Overview ────────────────────────────────────────────────
  result.push({
    label: "File Overview",
    startLine: 0,
    endLine: lines.length - 1,
    code: lines.slice(0, Math.min(60, lines.length)).join("\n"),
    level: 0,
  });

  // ── Level 1: Imports ──────────────────────────────────────────────────────
  if (importLines.length > 0) {
    const importStart = importLines[0].start;
    const importEnd = importLines[importLines.length - 1].end;
    result.push({
      label: "Imports",
      startLine: importStart,
      endLine: importEnd,
      code: lines.slice(importStart, importEnd + 1).join("\n"),
      level: 1,
    });
  }

  // ── Level 1/2: Classes, functions, top-level logic (source order) ─────────
  const groups: Array<{ startLine: number; items: SemanticBlock[] }> = [
    ...classEntries.map(ce => ({
      startLine: ce.block.startLine,
      items: [ce.block, ...ce.methods] as SemanticBlock[],
    })),
    ...functionBlocks.map(fb => ({ startLine: fb.startLine, items: [fb] as SemanticBlock[] })),
    ...mergeRanges(otherTopLevelRanges).map(r => ({
      startLine: r.start,
      items: [{
        label: "Top-level logic",
        startLine: r.start,
        endLine: r.end,
        code: lines.slice(r.start, r.end + 1).join("\n"),
        level: 1,
      }] as SemanticBlock[],
    })),
  ].sort((a, b) => a.startLine - b.startLine);

  for (const group of groups) {
    result.push(...group.items);
  }

  return result;
}

// ---------------------------------------------------------------------------
// TypeScript helpers
// ---------------------------------------------------------------------------

function extractTsClassMethods(
  classNode: Parser.SyntaxNode,
  lines: string[],
  className: string
): SemanticBlock[] {
  const methods: SemanticBlock[] = [];
  const bodyNode = classNode.children.find(c => c.type === "class_body");
  if (!bodyNode) return methods;

  for (const child of bodyNode.children) {
    if (child.type !== "method_definition") continue;
    const nameNode = child.childForFieldName("name");
    if (!nameNode) continue;
    const start = child.startPosition.row;
    const end = child.endPosition.row;
    methods.push({
      label: `Method: ${className}.${nameNode.text}`,
      startLine: start,
      endLine: end,
      code: lines.slice(start, end + 1).join("\n"),
      level: 2,
      parent: `Class: ${className}`,
    });
  }

  return methods;
}

function extractArrowFunctionName(node: Parser.SyntaxNode): string | null {
  let inner = node;
  if (node.type === "export_statement") {
    const decl = node.children.find(
      (c) => c.type === "lexical_declaration" || c.type === "variable_declaration"
    );
    if (!decl) return null;
    inner = decl;
  }

  const declarator = inner.children.find((c) => c.type === "variable_declarator");
  if (!declarator) return null;

  const valueNode = declarator.childForFieldName("value");
  if (!valueNode) return null;

  if (valueNode.type === "arrow_function" || valueNode.type === "function") {
    const nameNode = declarator.childForFieldName("name");
    return nameNode ? nameNode.text : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Python helpers
// ---------------------------------------------------------------------------

function extractPyClassMethods(
  classNode: Parser.SyntaxNode,
  lines: string[],
  className: string
): SemanticBlock[] {
  const methods: SemanticBlock[] = [];
  // Python class body is a "block" node
  const bodyNode = classNode.children.find(c => c.type === "block");
  if (!bodyNode) return methods;

  for (const child of bodyNode.children) {
    // Plain method
    if (child.type === "function_definition") {
      const nameNode = child.childForFieldName("name");
      if (!nameNode) continue;
      const start = child.startPosition.row;
      const end = child.endPosition.row;
      methods.push({
        label: `Method: ${className}.${nameNode.text}`,
        startLine: start,
        endLine: end,
        code: lines.slice(start, end + 1).join("\n"),
        level: 2,
        parent: `Class: ${className}`,
      });
    }
    // Decorated method (@staticmethod, @classmethod, @property, etc.)
    if (child.type === "decorated_definition") {
      const inner = child.children.find(c => c.type === "function_definition");
      if (!inner) continue;
      const nameNode = inner.childForFieldName("name");
      if (!nameNode) continue;
      const start = child.startPosition.row;
      const end = child.endPosition.row;
      methods.push({
        label: `Method: ${className}.${nameNode.text}`,
        startLine: start,
        endLine: end,
        code: lines.slice(start, end + 1).join("\n"),
        level: 2,
        parent: `Class: ${className}`,
      });
    }
  }

  return methods;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Merge adjacent / overlapping line ranges into contiguous spans. */
function mergeRanges(ranges: { start: number; end: number }[]): { start: number; end: number }[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end + 1) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}
