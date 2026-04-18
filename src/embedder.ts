/**
 * embedder.ts — local embedding via sentence-transformers (all-MiniLM-L6-v2).
 *
 * Spawns a persistent Python subprocess on first use; reuses it for all
 * subsequent calls in the same session.  No API key required.
 */

import * as cp from "child_process";
import { WalkthroughConfig } from "./config";

// ── Vector sizes ──────────────────────────────────────────────────────────────

export const VECTOR_SIZES: Record<string, number> = {
  local: 384,
};

export type EmbeddingProvider = "local";

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

type PendingRequest = {
  resolve: (vecs: number[][]) => void;
  reject:  (err: Error) => void;
};

let proc: cp.ChildProcessWithoutNullStreams | null = null;
let procReady = false;
let lineBuffer = "";
const queue: PendingRequest[] = [];

function handleLine(line: string): void {
  const req = queue.shift();
  if (!req) return;
  try {
    req.resolve(JSON.parse(line) as number[][]);
  } catch (e) {
    req.reject(new Error(`Local embedder parse error: ${e}`));
  }
}

function ensureProc(): Promise<void> {
  if (proc && !proc.killed && procReady) return Promise.resolve();

  return new Promise((resolve, reject) => {
    proc = cp.spawn("python", ["-u", "-c", EMBED_SCRIPT]);
    procReady = false;
    lineBuffer = "";
    let startupDone = false;

    proc.stdout.on("data", (data: Buffer) => {
      lineBuffer += data.toString();
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop()!;

      for (const line of lines) {
        if (!line.trim()) continue;
        if (!startupDone) {
          if (line.trim() === "ready") {
            startupDone = true;
            procReady = true;
            resolve();
          }
        } else {
          handleLine(line);
        }
      }
    });

    proc.stderr.on("data", (_d: Buffer) => { /* suppress transformers startup noise */ });

    proc.on("error", (e: Error) => {
      if (!startupDone) {
        reject(new Error(
          `Failed to start Python embedder: ${e.message}\n` +
          "Make sure Python and sentence-transformers are installed:\n" +
          "  pip install sentence-transformers"
        ));
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

export async function embed(
  texts: string[],
  _cfg: WalkthroughConfig
): Promise<number[][]> {
  if (!texts.length) return [];

  await ensureProc();

  return new Promise((resolve, reject) => {
    queue.push({ resolve, reject });
    proc!.stdin.write(JSON.stringify(texts) + "\n");
  });
}

export function disposeEmbedder(): void {
  if (proc && !proc.killed) {
    proc.stdin.end();
  }
  proc = null;
  procReady = false;
}
