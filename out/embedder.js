"use strict";
/**
 * embedder.ts — local embedding via sentence-transformers (all-MiniLM-L6-v2).
 *
 * Spawns a persistent Python subprocess on first use; reuses it for all
 * subsequent calls in the same session.  No API key required.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VECTOR_SIZES = void 0;
exports.embed = embed;
exports.disposeEmbedder = disposeEmbedder;
const cp = __importStar(require("child_process"));
// ── Vector sizes ──────────────────────────────────────────────────────────────
exports.VECTOR_SIZES = {
    local: 384,
};
// ── Persistent Python process ─────────────────────────────────────────────────
const EMBED_SCRIPT = [
    "import sys, json",
    "from sentence_transformers import SentenceTransformer",
    "model = SentenceTransformer('all-MiniLM-L6-v2')",
    "sys.stdout.write('ready\\n')",
    "sys.stdout.flush()",
    "for line in sys.stdin:",
    "    line = line.strip()",
    "    if not line: continue",
    "    texts = json.loads(line)",
    "    vecs = model.encode(texts).tolist()",
    "    sys.stdout.write(json.dumps(vecs) + '\\n')",
    "    sys.stdout.flush()",
].join("\n");
let proc = null;
let procReady = false;
let lineBuffer = "";
const queue = [];
function handleLine(line) {
    const req = queue.shift();
    if (!req)
        return;
    try {
        req.resolve(JSON.parse(line));
    }
    catch (e) {
        req.reject(new Error(`Local embedder parse error: ${e}`));
    }
}
function ensureProc() {
    if (proc && !proc.killed && procReady)
        return Promise.resolve();
    return new Promise((resolve, reject) => {
        proc = cp.spawn("python", ["-u", "-c", EMBED_SCRIPT]);
        procReady = false;
        lineBuffer = "";
        let startupDone = false;
        proc.stdout.on("data", (data) => {
            lineBuffer += data.toString();
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop();
            for (const line of lines) {
                if (!line.trim())
                    continue;
                if (!startupDone) {
                    if (line.trim() === "ready") {
                        startupDone = true;
                        procReady = true;
                        resolve();
                    }
                }
                else {
                    handleLine(line);
                }
            }
        });
        proc.stderr.on("data", (_d) => { });
        proc.on("error", (e) => {
            if (!startupDone) {
                reject(new Error(`Failed to start Python embedder: ${e.message}\n` +
                    "Make sure Python and sentence-transformers are installed:\n" +
                    "  pip install sentence-transformers"));
            }
        });
        proc.on("close", (code) => {
            procReady = false;
            proc = null;
            const remaining = queue.splice(0);
            for (const r of remaining) {
                r.reject(new Error(`Python embedder process exited with code ${code}`));
            }
        });
    });
}
// ── Public API ────────────────────────────────────────────────────────────────
async function embed(texts, _cfg) {
    if (!texts.length)
        return [];
    await ensureProc();
    return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
        proc.stdin.write(JSON.stringify(texts) + "\n");
    });
}
function disposeEmbedder() {
    if (proc && !proc.killed) {
        proc.stdin.end();
    }
    proc = null;
    procReady = false;
}
//# sourceMappingURL=embedder.js.map