"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBlocks = parseBlocks;
exports.filterImportantBlocks = filterImportantBlocks;
const Parser = require("tree-sitter");
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
function parseBlocks(source, languageId = "typescript") {
    if (languageId === "python") {
        return parsePythonBlocks(source);
    }
    return parseTypeScriptBlocks(source);
}
// ---------------------------------------------------------------------------
// TypeScript parser
// ---------------------------------------------------------------------------
function parseTypeScriptBlocks(source) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TypeScript = require("tree-sitter-typescript").typescript;
    const parser = new Parser();
    parser.setLanguage(TypeScript);
    const tree = parser.parse(source);
    const lines = source.split("\n");
    const classEntries = [];
    const functionBlocks = [];
    const importLines = [];
    const otherTopLevelRanges = [];
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
            const classBlock = {
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
        if (node.type === "export_statement" ||
            node.type === "lexical_declaration" ||
            node.type === "variable_declaration") {
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
function parsePythonBlocks(source) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Python = require("tree-sitter-python");
    const parser = new Parser();
    parser.setLanguage(Python);
    const tree = parser.parse(source);
    const lines = source.split("\n");
    const classEntries = [];
    const functionBlocks = [];
    const importLines = [];
    const otherTopLevelRanges = [];
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
            const classBlock = {
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
            const inner = node.children.find((c) => c.type === "class_definition" || c.type === "function_definition");
            if (inner) {
                const nameNode = inner.childForFieldName("name");
                const name = nameNode ? nameNode.text : "<anonymous>";
                if (inner.type === "class_definition") {
                    const classBlock = {
                        label: `Class: ${name}`,
                        startLine: start,
                        endLine: end,
                        code: nodeCode,
                        level: 1,
                    };
                    const methods = extractPyClassMethods(inner, lines, name);
                    classEntries.push({ block: classBlock, methods });
                }
                else {
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
function assembleBlocks(lines, classEntries, functionBlocks, importLines, otherTopLevelRanges) {
    const result = [];
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
    const groups = [
        ...classEntries.map(ce => ({
            startLine: ce.block.startLine,
            items: [ce.block, ...ce.methods],
        })),
        ...functionBlocks.map(fb => ({ startLine: fb.startLine, items: [fb] })),
        ...mergeRanges(otherTopLevelRanges).map(r => ({
            startLine: r.start,
            items: [{
                    label: "Top-level logic",
                    startLine: r.start,
                    endLine: r.end,
                    code: lines.slice(r.start, r.end + 1).join("\n"),
                    level: 1,
                }],
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
function extractTsClassMethods(classNode, lines, className) {
    const methods = [];
    const bodyNode = classNode.children.find(c => c.type === "class_body");
    if (!bodyNode)
        return methods;
    for (const child of bodyNode.children) {
        if (child.type !== "method_definition")
            continue;
        const nameNode = child.childForFieldName("name");
        if (!nameNode)
            continue;
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
function extractArrowFunctionName(node) {
    let inner = node;
    if (node.type === "export_statement") {
        const decl = node.children.find((c) => c.type === "lexical_declaration" || c.type === "variable_declaration");
        if (!decl)
            return null;
        inner = decl;
    }
    const declarator = inner.children.find((c) => c.type === "variable_declarator");
    if (!declarator)
        return null;
    const valueNode = declarator.childForFieldName("value");
    if (!valueNode)
        return null;
    if (valueNode.type === "arrow_function" || valueNode.type === "function") {
        const nameNode = declarator.childForFieldName("name");
        return nameNode ? nameNode.text : null;
    }
    return null;
}
// ---------------------------------------------------------------------------
// Python helpers
// ---------------------------------------------------------------------------
function extractPyClassMethods(classNode, lines, className) {
    const methods = [];
    // Python class body is a "block" node
    const bodyNode = classNode.children.find(c => c.type === "block");
    if (!bodyNode)
        return methods;
    for (const child of bodyNode.children) {
        // Plain method
        if (child.type === "function_definition") {
            const nameNode = child.childForFieldName("name");
            if (!nameNode)
                continue;
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
            if (!inner)
                continue;
            const nameNode = inner.childForFieldName("name");
            if (!nameNode)
                continue;
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
// ---------------------------------------------------------------------------
// Block filtering
// ---------------------------------------------------------------------------
/**
 * Filters parsed blocks down to those worth narrating, setting `isImportant`
 * on every kept block. Trivial import groups, comment-only blocks, bare
 * interface/type declarations, single-line config constants, and no-op Python
 * __init__ / docstring-only methods are discarded.
 */
function filterImportantBlocks(blocks) {
    const result = [];
    for (const block of blocks) {
        if (isBlockImportant(block))
            result.push({ ...block, isImportant: true });
    }
    return result;
}
function isBlockImportant(block) {
    const { label, code, level } = block;
    const trimmedLines = code.split('\n').map(l => l.trim()).filter(Boolean);
    // ── Always keep ────────────────────────────────────────────────────────────
    if (level === 0)
        return true; // File Overview
    if (label.startsWith('Class:'))
        return true; // class declarations
    if (/\bawait\b|\basync\b|\btry[\s{(]|\bcatch\b|\bthrow\b|\braise\b|\bexcept[\s:]/.test(code))
        return true;
    if (/if\s+__name__\s*==\s*["']__main__["']/.test(code))
        return true; // Python main guard
    // ── Remove: import groups ──────────────────────────────────────────────────
    if (label.startsWith('Imports'))
        return false;
    if (trimmedLines.length > 0 && trimmedLines.every(l => /^(import\s+|from\s+\S+\s+import)/.test(l)))
        return false;
    // ── Remove: comment-only blocks ────────────────────────────────────────────
    const isCommentLine = (l) => l.startsWith('//') || l.startsWith('#') || l.startsWith('/*') || l.startsWith('*') || l === '*/';
    if (trimmedLines.length > 0 && trimmedLines.every(isCommentLine))
        return false;
    // ── Remove: TS interface / type alias declarations ─────────────────────────
    if (/^(export\s+)?(interface|type)\s+\w+[\s{<]/.test(code.trimStart()))
        return false;
    // ── Remove: TS single-line config constant (const FOO = "bar") ───────────
    if (code.split('\n').filter(l => l.trim()).length === 1) {
        if (/^(export\s+)?(const|let|var)\s+\w+(\s*:\s*[\w<>\[\]|&]+)?\s*=\s*["'`\-\d]/.test(code.trim())) {
            return false;
        }
    }
    // ── Remove: Python trivial __init__ (only pass / super().__init__()) ───────
    if (label.includes('.__init__')) {
        const body = trimmedLines.filter(l => !l.startsWith('def ') && !l.startsWith('@'));
        if (body.length > 0 && body.every(l => l === 'pass' || /^super\(\)\.__init__/.test(l) || isCommentLine(l)))
            return false;
    }
    // ── Remove: Python function / method that is only a docstring ─────────────
    if (label.startsWith('Function:') || label.startsWith('Method:')) {
        const body = trimmedLines.filter(l => !l.startsWith('def ') && !l.startsWith('@'));
        const isDocstringOnly = body.every(l => l.startsWith('"""') || l.endsWith('"""') || l === '"""' ||
            l.startsWith("'''") || l.endsWith("'''") || l === "'''" ||
            l === 'pass' || isCommentLine(l));
        if (isDocstringOnly && body.length > 0)
            return false;
    }
    return true;
}
/** Merge adjacent / overlapping line ranges into contiguous spans. */
function mergeRanges(ranges) {
    if (ranges.length === 0)
        return [];
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const merged = [{ ...sorted[0] }];
    for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1];
        if (sorted[i].start <= last.end + 1) {
            last.end = Math.max(last.end, sorted[i].end);
        }
        else {
            merged.push({ ...sorted[i] });
        }
    }
    return merged;
}
//# sourceMappingURL=parser.js.map