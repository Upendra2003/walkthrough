/**
 * codebaseIndexer.ts — scans the workspace, embeds every semantic block,
 * and upserts the vectors + code payload into Qdrant.
 *
 * Features:
 *   • Hash-based incremental cache  → only re-embeds changed/new files
 *   • Batch embedding               → 10 blocks per API call (reduces latency)
 *   • Auto-creates/recreates Qdrant collection with correct vector size
 *   • Graceful Qdrant-offline handling  → warns and skips indexing
 */

import * as fs   from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import * as crypto from "crypto";
import { parseBlocks }          from "./parser";
import { embed, VECTOR_SIZES }  from "./embedder";
import { WalkthroughConfig }    from "./config";

// ── Types ─────────────────────────────────────────────────────────────────────

interface IndexProgress {
  message:   string;
  increment: number;
  current:   number;
  total:     number;
}

interface IndexResult {
  indexed: number;
  skipped: number;
  files:   number;
}

interface CacheEntry { hash: string; blockCount: number; indexedAt: number; }
interface Cache {
  embeddingProvider: string;
  vectorSize:        number;
  files:             Record<string, CacheEntry>;  // relativePath → entry
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLLECTION = "code_blocks";
const BATCH_SIZE  = 10;

const SKIP_DIRS = new Set([
  ".git", "__pycache__", "node_modules", "venv", ".venv", "env",
  "dist", "build", ".next", ".tox", "site-packages", ".mypy_cache",
  "migrations", "out", ".vscode",
]);

const SUPPORTED_EXTS = new Set([".py", ".ts", ".tsx"]);

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Fast, synchronous pre-check — reads only the local cache file and file hashes.
 * No network calls. Returns true if any file is new/changed or the provider changed.
 * Use this before showing the indexing UI to avoid unnecessary embedding work.
 */
export function needsIndexing(wsRoot: string, cfg: WalkthroughConfig): boolean {
  const provider   = cfg.embeddingProvider ?? "local";
  const vectorSize = VECTOR_SIZES[provider] ?? 384;
  const cache      = loadCache(wsRoot);

  // Provider or vector size changed → full re-index required
  if (cache.embeddingProvider !== provider || cache.vectorSize !== vectorSize) return true;

  const files = scanFiles(wsRoot);

  // No files at all → nothing to index
  if (files.length === 0) return false;

  for (const filePath of files) {
    const relPath = path.relative(wsRoot, filePath).replace(/\\/g, "/");
    let source: string;
    try { source = fs.readFileSync(filePath, "utf8"); }
    catch { return true; }  // can't read → treat as changed

    if (cache.files[relPath]?.hash !== fileHash(source)) return true;
  }

  return false;  // every file matches the cache — nothing to do
}

export async function indexWorkspace(
  wsRoot:     string,
  cfg:        WalkthroughConfig,
  onProgress: (p: IndexProgress) => void,
  onLog:      (msg: string) => void
): Promise<IndexResult> {

  const provider   = cfg.embeddingProvider ?? "local";
  const vectorSize = VECTOR_SIZES[provider] ?? 384;
  const qdrantUrl  = (process.env.QDRANT_URL ?? "http://localhost:6333").replace(/\/$/, "");
  const qdrantKey  = process.env.QDRANT_API_KEY;

  // ── 1. Check Qdrant is reachable ─────────────────────────────────────────
  onProgress({ message: "Connecting to Qdrant...", increment: 0, current: 0, total: 0 });
  const reachable = await pingQdrant(qdrantUrl, qdrantKey);
  if (!reachable) {
    onLog("[index] Qdrant not reachable — skipping indexing. Q&A will not work until Qdrant is running.");
    throw new Error("Qdrant is not running at " + qdrantUrl + ". Start Qdrant and try again.");
  }
  onLog(`[index] Qdrant reachable at ${qdrantUrl}`);

  // ── 2. Ensure collection has correct vector size ──────────────────────────
  onProgress({ message: "Preparing vector collection...", increment: 2, current: 0, total: 0 });
  await ensureCollection(qdrantUrl, qdrantKey, vectorSize);
  onLog(`[index] Collection "${COLLECTION}" ready (${vectorSize} dims, Cosine)`);

  // ── 3. Load hash cache ────────────────────────────────────────────────────
  const cache = loadCache(wsRoot);

  // If embedding provider changed, invalidate all cached entries
  if (cache.embeddingProvider !== provider || cache.vectorSize !== vectorSize) {
    onLog("[index] Provider/vector-size changed — full re-index");
    cache.files = {};
    cache.embeddingProvider = provider;
    cache.vectorSize = vectorSize;
  }

  // ── 4. Scan files ─────────────────────────────────────────────────────────
  onProgress({ message: "Scanning workspace files...", increment: 3, current: 0, total: 0 });
  const files = scanFiles(wsRoot);
  onLog(`[index] Found ${files.length} file(s) to process`);

  if (files.length === 0) {
    return { indexed: 0, skipped: 0, files: 0 };
  }

  // ── 5. Embed changed files ────────────────────────────────────────────────
  let indexed = 0;
  let skipped = 0;
  const incrementPerFile = 93 / files.length;

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const relPath  = path.relative(wsRoot, filePath).replace(/\\/g, "/");
    const lang     = extToLang(filePath);

    // Read file and hash it
    let source: string;
    try { source = fs.readFileSync(filePath, "utf8"); }
    catch { onLog(`[index] Cannot read ${relPath} — skipping`); continue; }

    const hash    = fileHash(source);
    const cached  = cache.files[relPath];

    onProgress({
      message:   `${cached?.hash === hash ? "✓" : "⚡"} ${path.basename(filePath)}  (${i + 1}/${files.length})`,
      increment: incrementPerFile,
      current:   i + 1,
      total:     files.length,
    });

    if (cached?.hash === hash) {
      skipped += cached.blockCount;
      onLog(`[index] ${relPath} — unchanged, using cached ${cached.blockCount} block(s)`);
      continue;
    }

    // Parse blocks
    let blocks;
    try { blocks = parseBlocks(source, lang); }
    catch (e) { onLog(`[index] Parse error in ${relPath}: ${e}`); continue; }

    if (blocks.length === 0) {
      cache.files[relPath] = { hash, blockCount: 0, indexedAt: Date.now() };
      continue;
    }

    onLog(`[index] ${relPath} — ${blocks.length} block(s), embedding...`);

    // Embed in batches
    for (let b = 0; b < blocks.length; b += BATCH_SIZE) {
      const batch = blocks.slice(b, b + BATCH_SIZE);
      const texts = batch.map(bl => `${bl.label}\n${bl.code.slice(0, 512)}`);

      let vectors: number[][];
      try { vectors = await embed(texts, cfg); }
      catch (e) {
        onLog(`[index] Embedding error for batch in ${relPath}: ${e}`);
        throw e; // propagate — let caller show error
      }

      const points = batch.map((bl, j) => ({
        id:      stableUUID(relPath, bl.label),
        vector:  vectors[j],
        payload: {
          code:      bl.code,
          label:     bl.label,
          file:      relPath,
          language:  lang,
          startLine: bl.startLine,
          endLine:   bl.endLine,
        },
      }));

      await qdrantUpsert(qdrantUrl, qdrantKey, points);
      indexed += batch.length;
    }

    cache.files[relPath] = { hash, blockCount: blocks.length, indexedAt: Date.now() };
    onLog(`[index] ${relPath} — ${blocks.length} block(s) indexed`);
  }

  // ── 6. Persist cache ──────────────────────────────────────────────────────
  saveCache(wsRoot, cache);

  const total = indexed + skipped;
  onLog(`[index] Done — ${indexed} new, ${skipped} cached, ${total} total blocks`);

  return { indexed, skipped, files: files.length };
}

// ── File scanning ─────────────────────────────────────────────────────────────

function scanFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(d: string): void {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch { return; }

    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (SKIP_DIRS.has(e.name)) continue;

      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (SUPPORTED_EXTS.has(path.extname(e.name).toLowerCase())) results.push(full);
    }
  }

  walk(dir);
  return results;
}

function extToLang(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".py") return "python";
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  return "javascript";
}

// ── Hash cache ────────────────────────────────────────────────────────────────

function cachePath(wsRoot: string): string {
  return path.join(wsRoot, ".vscode", "walkthrough-vector-cache.json");
}

function loadCache(wsRoot: string): Cache {
  const p = cachePath(wsRoot);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); }
    catch { /* corrupt cache — start fresh */ }
  }
  return { embeddingProvider: "", vectorSize: 0, files: {} };
}

function saveCache(wsRoot: string, cache: Cache): void {
  const p   = cachePath(wsRoot);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2));
}

function fileHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** Stable UUID derived from file path + block label — ensures idempotent upserts. */
function stableUUID(file: string, label: string): string {
  const h = crypto.createHash("md5").update(`${file}::${label}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────

async function pingQdrant(base: string, key?: string): Promise<boolean> {
  try {
    await qdrantGet(base, key, "/healthz");
    return true;
  } catch {
    return false;
  }
}

async function ensureCollection(base: string, key: string | undefined, size: number): Promise<void> {
  // Check existing
  try {
    const info = await qdrantGet(base, key, `/collections/${COLLECTION}`) as {
      result?: { config?: { params?: { vectors?: { size?: number } } } };
    };
    const existing = info.result?.config?.params?.vectors?.size;
    if (existing === size) return;  // already correct

    // Wrong size — delete and recreate
    await qdrantDelete(base, key, `/collections/${COLLECTION}`);
  } catch { /* doesn't exist yet */ }

  // Create
  await qdrantPut(base, key, `/collections/${COLLECTION}`, {
    vectors: { size, distance: "Cosine" },
  });
}

async function qdrantUpsert(
  base:   string,
  key:    string | undefined,
  points: Array<{ id: string; vector: number[]; payload: object }>
): Promise<void> {
  await qdrantReq("PUT", base, key, `/collections/${COLLECTION}/points`, { points });
}

function qdrantGet(base: string, key: string | undefined, urlPath: string): Promise<unknown> {
  return qdrantReq("GET", base, key, urlPath);
}

function qdrantDelete(base: string, key: string | undefined, urlPath: string): Promise<unknown> {
  return qdrantReq("DELETE", base, key, urlPath);
}

function qdrantPut(base: string, key: string | undefined, urlPath: string, body?: object): Promise<unknown> {
  return qdrantReq("PUT", base, key, urlPath, body);
}

function qdrantReq(
  method:  string,
  base:    string,
  apiKey:  string | undefined,
  urlPath: string,
  body?:   object
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const fullUrl  = new URL(urlPath, base + "/");
    const isHttps  = fullUrl.protocol === "https:";
    const bodyStr  = body ? JSON.stringify(body) : "";
    const headers: Record<string, string | number> = { "Content-Type": "application/json" };
    if (bodyStr) headers["Content-Length"] = Buffer.byteLength(bodyStr);
    if (apiKey)  headers["api-key"]        = apiKey;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport: any = isHttps ? https : http;

    const req = transport.request(
      {
        hostname: fullUrl.hostname,
        port:     fullUrl.port ? Number(fullUrl.port) : isHttps ? 443 : 6333,
        path:     fullUrl.pathname + (fullUrl.search ?? ""),
        method,
        headers,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res: any) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try { resolve(JSON.parse(text)); }
          catch { resolve(text); }
        });
        res.on("error", reject);
      }
    );

    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}
