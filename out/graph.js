"use strict";
/**
 * Import graph builder.
 *
 * Parses a root file, extracts its local imports, follows them recursively,
 * and returns an ImportGraph — the full dependency tree starting from the root.
 *
 * Resolution strategy (two-tier):
 *   1. Path math — derive file path from module name + known base dirs.
 *   2. Workspace scan fallback — if path math misses, search the pre-built
 *      module-to-file map produced by scanWorkspaceFiles().
 *
 * Circular imports are handled via a "building" set (cycle breaker).
 * Files that appear in multiple import paths share the same FileNode (deduped).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildImportGraph = buildImportGraph;
exports.flattenDFS = flattenDFS;
exports.detectMainFile = detectMainFile;
const path = require("path");
const fs = require("fs");
const vscode = require("vscode");
// ── Constants ─────────────────────────────────────────────────────────────────
/** Only files with these extensions enter the graph. */
const EXPLAINABLE = new Set([".py", ".ts", ".tsx"]);
/** Directories that are never scanned (stdlib, venvs, build artefacts, etc.) */
const SKIP_DIRS = new Set([
    ".git", "__pycache__", "node_modules",
    "venv", ".venv", "env", ".env",
    "dist", "build", ".next", ".tox",
    "site-packages", ".mypy_cache", "migrations",
]);
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Build an import graph rooted at `rootFile`.
 * Scans the workspace once up-front to build a module-lookup map used as
 * a fallback when path-based resolution can't find a file.
 */
function buildImportGraph(rootFile, workspaceRoot, maxDepth = 6) {
    const nodeMap = new Map();
    const building = new Set(); // cycle detection
    const wsFileMap = scanWorkspaceFiles(workspaceRoot);
    function buildNode(filePath, depth) {
        const id = path.normalize(filePath);
        if (nodeMap.has(id))
            return nodeMap.get(id); // dedup
        const lang = detectLanguage(filePath);
        const relPath = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
        const node = {
            id, file: id, relativePath: relPath,
            language: lang, children: [], status: "pending", depth,
        };
        nodeMap.set(id, node);
        if (depth >= maxDepth || building.has(id))
            return node;
        building.add(id);
        let source = "";
        try {
            source = fs.readFileSync(filePath, "utf8");
        }
        catch { /* unreadable */ }
        for (const imp of extractImports(source, lang)) {
            const resolved = resolveImport(imp, filePath, workspaceRoot, lang, wsFileMap);
            if (!resolved)
                continue;
            const normResolved = path.normalize(resolved);
            if (!normResolved.startsWith(path.normalize(workspaceRoot)))
                continue;
            if (!EXPLAINABLE.has(path.extname(normResolved).toLowerCase()))
                continue;
            const child = buildNode(resolved, depth + 1);
            if (!node.children.some(c => c.id === child.id)) {
                node.children.push(child);
            }
        }
        building.delete(id);
        return node;
    }
    const root = buildNode(rootFile, 0);
    return { root, nodeMap };
}
/**
 * Flatten the graph into DFS pre-order (parent before children).
 * Each node appears exactly once — duplicates are skipped.
 */
function flattenDFS(graph) {
    const result = [];
    const seen = new Set();
    function dfs(node) {
        if (seen.has(node.id))
            return;
        seen.add(node.id);
        result.push(node);
        for (const child of node.children)
            dfs(child);
    }
    dfs(graph.root);
    return result;
}
/**
 * Detect the project's main entry-point file.
 *
 * Language is inferred by counting .ts vs .py files (package.json presence
 * gives TypeScript the tiebreaker).
 *
 * TypeScript order: package.json "main" → src/index.ts → index.ts →
 *   src/main.ts → main.ts → active editor.
 * Python order: main.py → app.py → server.py → run.py → wsgi.py →
 *   manage.py → first .py file with `if __name__ == "__main__"` → active editor.
 */
async function detectMainFile(wsRoot) {
    const hasRoot = wsRoot.length > 0;
    const hasPackageJson = hasRoot && fs.existsSync(path.join(wsRoot, "package.json"));
    const tsFiles = hasRoot ? collectFilesByExt(wsRoot, ".ts") : [];
    const pyFiles = hasRoot ? collectFilesByExt(wsRoot, ".py") : [];
    const isTypeScript = hasPackageJson || tsFiles.length >= pyFiles.length;
    if (isTypeScript && hasRoot) {
        // 1. package.json "main" → resolve to absolute path
        if (hasPackageJson) {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(wsRoot, "package.json"), "utf8"));
                if (typeof pkg.main === "string") {
                    const base = path.resolve(wsRoot, pkg.main);
                    const stem = path.basename(pkg.main, path.extname(pkg.main));
                    for (const c of [
                        base,
                        base + ".ts",
                        base.replace(/\.js$/, ".ts"),
                        path.join(wsRoot, "src", stem + ".ts"), // out/extension.js → src/extension.ts
                        path.join(wsRoot, stem + ".ts"),
                    ]) {
                        if (fs.existsSync(c))
                            return c;
                    }
                }
            }
            catch { /* malformed package.json */ }
        }
        // 2. Fallback candidates
        for (const rel of ["src/index.ts", "index.ts", "src/main.ts", "main.ts"]) {
            const full = path.join(wsRoot, rel);
            if (fs.existsSync(full))
                return full;
        }
    }
    else if (hasRoot) {
        // 1. Named Python candidates
        for (const rel of ["main.py", "app.py", "server.py", "run.py", "wsgi.py", "manage.py"]) {
            const full = path.join(wsRoot, rel);
            if (fs.existsSync(full))
                return full;
        }
        // 2. Scan all .py files for if __name__ == "__main__"
        for (const file of pyFiles) {
            try {
                const src = fs.readFileSync(file, "utf8");
                if (src.includes('if __name__ == "__main__"') || src.includes("if __name__ == '__main__'")) {
                    return file;
                }
            }
            catch { /* unreadable */ }
        }
    }
    // Final fallback: active editor
    return vscode.window.activeTextEditor?.document.uri.fsPath ?? "";
}
// ── File collector (used by detectMainFile) ───────────────────────────────────
/** Recursively collect all files with the given extension, honouring SKIP_DIRS. */
function collectFilesByExt(dir, ext) {
    const results = [];
    try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name))
                continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory())
                results.push(...collectFilesByExt(full, ext));
            else if (path.extname(entry.name).toLowerCase() === ext)
                results.push(full);
        }
    }
    catch { /* unreadable directory */ }
    return results;
}
// ── Workspace scanner ─────────────────────────────────────────────────────────
/**
 * Recursively walk `wsRoot`, index every explainable file by its dotted module
 * name AND by its bare filename stem.  Used as a fallback resolver.
 *
 * Examples (relative to wsRoot):
 *   routes/forms.py   → "routes.forms"  AND "forms"
 *   services/db.py    → "services.db"   AND "db"
 *   utils/__init__.py → skipped (package marker, not a module we explain)
 */
function scanWorkspaceFiles(wsRoot) {
    const map = new Map();
    function scan(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            if (e.name.startsWith("."))
                continue;
            if (SKIP_DIRS.has(e.name))
                continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                scan(full);
                continue;
            }
            const ext = path.extname(e.name).toLowerCase();
            if (!EXPLAINABLE.has(ext))
                continue;
            if (e.name === "__init__.py")
                continue; // package marker — skip
            const rel = path.relative(wsRoot, full).replace(/\\/g, "/");
            const dotKey = rel.replace(/\.(py|tsx?|js)$/, "").replace(/\//g, ".");
            // Full dotted key: "routes.forms"
            if (!map.has(dotKey))
                map.set(dotKey, full);
            // Bare stem key: "forms"  (first file wins on collisions)
            const stem = dotKey.split(".").pop();
            if (!map.has(stem))
                map.set(stem, full);
        }
    }
    scan(wsRoot);
    return map;
}
// ── Language detection ────────────────────────────────────────────────────────
function detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".py")
        return "python";
    if (ext === ".ts" || ext === ".tsx")
        return "typescript";
    if (ext === ".js" || ext === ".jsx")
        return "javascript";
    return "unknown";
}
// ── Import extraction ─────────────────────────────────────────────────────────
function extractImports(source, lang) {
    if (lang === "python")
        return extractPythonImports(source);
    if (lang === "typescript" || lang === "javascript")
        return extractTsImports(source);
    return [];
}
/**
 * Extract Python import targets.
 *
 * Three distinct patterns — each handled by its own regex so they never
 * interfere with one another:
 *
 *   1. `import foo` / `import foo.bar`
 *   2. `from foo.bar import ...`   — we only need "foo.bar" (the from-clause)
 *   3. `from . import x, y`        — pure-dot relative; we need the names too
 *
 * CRITICAL: none of these regexes use `\s` inside a repeated group at the
 * end of the pattern, because `\s` matches `\n` and would cause the engine
 * to consume the next `from` line and break the `^` anchor for subsequent
 * matches with the `gm` flags.
 */
function extractPythonImports(source) {
    const mods = new Set();
    // ── 1. "import X" / "import X.Y" ──────────────────────────────────────────
    for (const m of source.matchAll(/^import\s+([\w.]+)/gm)) {
        mods.add(m[1]);
    }
    // ── 2. "from X import ..." where X contains word chars (not pure dots) ─────
    // Regex stops at the word "import" — never crosses a line boundary.
    // Covers: "from routes.forms import bp", "from .models import User",
    //         "from ..utils import helper", "from flask import Flask" (→ unresolved, OK)
    for (const m of source.matchAll(/^from\s+(\.{0,3}[\w][\w.]*)\s+import/gm)) {
        mods.add(m[1]);
    }
    // ── 3. "from . import x, y" — pure-dot relative siblings ─────────────────
    // Inline form:  from .   import models, views
    // Parens form:  from ..  import (\n    models,\n    views\n)
    // For the parens form, [\s\S]*? is safe because it's bounded by \) on the right.
    for (const m of source.matchAll(/^from\s+(\.+)\s+import\s+\(([\s\S]*?)\)/gm)) {
        const dots = m[1];
        extractNames(m[2]).forEach(n => mods.add(dots + n));
    }
    // Inline (no parens) — capture to end of line only ([^\n]+), not across lines.
    for (const m of source.matchAll(/^from\s+(\.+)\s+import\s+([^\n(#\\]+)/gm)) {
        const dots = m[1];
        extractNames(m[2]).forEach(n => mods.add(dots + n));
    }
    return [...mods];
}
/** Split a comma-separated name list, discarding `as` aliases and keywords. */
function extractNames(raw) {
    return raw.split(",")
        .map(s => s.trim().split(/\s/)[0]) // "foo as bar" → "foo"
        .filter(n => n.length > 0 && /^\w/.test(n) && n !== "import");
}
function extractTsImports(source) {
    const mods = new Set();
    for (const m of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        mods.add(m[1]);
    }
    for (const m of source.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        mods.add(m[1]);
    }
    return [...mods];
}
// ── Import resolution ─────────────────────────────────────────────────────────
function resolveImport(importName, currentFile, workspaceRoot, lang, wsFileMap) {
    if (lang === "python")
        return resolvePythonImport(importName, currentFile, workspaceRoot, wsFileMap);
    if (lang === "typescript" || lang === "javascript")
        return resolveTsImport(importName, currentFile);
    return null;
}
function resolvePythonImport(moduleName, currentFile, workspaceRoot, wsFileMap) {
    const isRelative = moduleName.startsWith(".");
    let baseDir;
    let remaining;
    if (isRelative) {
        const match = moduleName.match(/^(\.+)(.*)/);
        const dots = match?.[1] ?? ".";
        const rest = match?.[2] ?? "";
        baseDir = path.dirname(currentFile);
        for (let i = 1; i < dots.length; i++)
            baseDir = path.dirname(baseDir);
        remaining = rest;
    }
    else {
        baseDir = workspaceRoot;
        remaining = moduleName;
    }
    if (!remaining)
        return null;
    const parts = remaining.split(".");
    // ── Tier 1: path math ──────────────────────────────────────────────────────
    const candidates = [
        path.join(baseDir, ...parts) + ".py",
        path.join(baseDir, ...parts, "__init__.py"),
    ];
    // For absolute imports also try from the file's own directory
    if (!isRelative) {
        const localBase = path.dirname(currentFile);
        candidates.push(path.join(localBase, ...parts) + ".py", path.join(localBase, ...parts, "__init__.py"));
    }
    for (const c of candidates) {
        if (fs.existsSync(c))
            return c;
    }
    // ── Tier 2: workspace scan fallback ────────────────────────────────────────
    // Only used for absolute imports (relative ones must live in the package tree)
    if (!isRelative) {
        // Try full dotted key: "routes.forms"
        const full = wsFileMap.get(remaining);
        if (full)
            return full;
        // Try last component only: "forms"
        const last = parts[parts.length - 1];
        const byLast = wsFileMap.get(last);
        if (byLast)
            return byLast;
    }
    return null;
}
function resolveTsImport(importPath, currentFile) {
    if (!importPath.startsWith("."))
        return null; // skip node_modules
    const base = path.resolve(path.dirname(currentFile), importPath);
    for (const c of [
        base + ".ts", base + ".tsx", base + ".js",
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
        path.join(base, "index.js"),
    ]) {
        if (fs.existsSync(c))
            return c;
    }
    return null;
}
//# sourceMappingURL=graph.js.map