/**
 * narrate.ts — LLM narration, Sarvam TTS, Qdrant Q&A, Deep Dive.
 *
 * Provider routing (all via raw HTTP, no SDK dependency):
 *   groq      → https://api.groq.com/openai/v1/chat/completions (OpenAI-compat)
 *   openai    → https://api.openai.com/v1/chat/completions
 *   anthropic → https://api.anthropic.com/v1/messages  (different format)
 *   custom    → {customBaseUrl}/chat/completions
 *
 * Sarvam TTS key is read from activeConfig.sarvamApiKey, with .env as dev fallback.
 */

import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { SemanticBlock } from "./parser";
import { WalkthroughConfig } from "./config";
import { embed } from "./embedder";
import { CrossFileContext } from "./blueprintTypes";

// ---------------------------------------------------------------------------
// .env fallback (developer use only — overridden by SecretStorage in production)
// ---------------------------------------------------------------------------

(function loadEnv() {
  const envFile = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
})();

// ---------------------------------------------------------------------------
// Active config (set by extension.ts before each session)
// ---------------------------------------------------------------------------

let activeConfig: WalkthroughConfig | null = null;

/** Called by extension.ts after loading config from SecretStorage. */
export function setActiveConfig(cfg: WalkthroughConfig): void {
  activeConfig = cfg;
}

function getConfig(): WalkthroughConfig {
  if (activeConfig) return activeConfig;
  // Dev fallback: assume Groq with .env keys
  return {
    provider: "groq",
    model: process.env.GROQ_MODEL ?? "qwen/qwen3-32b",
    apiKey: process.env.GROQ_API_KEY ?? "",
    sarvamApiKey: process.env.SARVAM_API_KEY ?? "",
    customBaseUrl: "",
    embeddingProvider: "local",
    language: "en",
  };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const PLAIN_SPEECH_RULE =
  "IMPORTANT: Write in plain spoken English only. " +
  "Do NOT use backticks, underscores, asterisks, hash signs, angle brackets, or any markdown. " +
  "Do NOT write variable/function names in code style — say them as plain words. " +
  "This text is read aloud by a TTS voice so write exactly as you would speak.";

const SYSTEM_PROMPT =
  "You are a code walkthrough narrator for an animated video tool. " +
  "Summarise this code block in 3 to 4 sentences, 60 to 80 words total. " +
  "Sentence 1: state the single main purpose of this block — what it does. " +
  "Sentences 2 to 3: walk through the key flow — what happens first, what the important check or action is. " +
  "Sentence 4 if needed: the final outcome, return value, or side effect. " +
  "Be direct and technical. No analogies, no filler, no 'think of it as' phrases. " +
  "For a File Overview block: describe the file's architecture and main responsibility — not individual imports. " +
  PLAIN_SPEECH_RULE;

// ---------------------------------------------------------------------------
// Raw HTTP helper
// ---------------------------------------------------------------------------

function rawPost(url: string, headers: Record<string, string>, body: object): Promise<string> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    let parsed: URL;
    try { parsed = new URL(url); } catch { reject(new Error(`Invalid URL: ${url}`)); return; }

    const isHttps = parsed.protocol === "https:";
    const port = parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport: any = isHttps ? https : http;

    const req = transport.request(
      {
        hostname: parsed.hostname,
        port,
        path: parsed.pathname + (parsed.search ?? ""),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
          ...headers,
        },
      },
      (res: import("http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      }
    );

    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Unified LLM call — routes to provider-specific logic
// ---------------------------------------------------------------------------

type Message = { role: string; content: string };

export async function callLLM(
  systemPrompt: string,
  userContent: string,
  maxTokens: number
): Promise<string> {
  const cfg = getConfig();

  if (cfg.provider === "anthropic") {
    return callAnthropic(systemPrompt, userContent, maxTokens, cfg);
  }
  return callOpenAICompat(systemPrompt, userContent, maxTokens, cfg);
}

/** OpenAI-compatible call — works for Groq, OpenAI, and Custom. */
async function callOpenAICompat(
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
  cfg: WalkthroughConfig
): Promise<string> {
  const base: Record<string, string> = {
    groq: "https://api.groq.com/openai/v1",
    openai: "https://api.openai.com/v1",
    custom: cfg.customBaseUrl.replace(/\/$/, "") || "https://api.openai.com/v1",
  };
  const url = `${base[cfg.provider] ?? base.groq}/chat/completions`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = { model: cfg.model, max_tokens: maxTokens, messages };

  // Groq qwen3 supports reasoning_effort to skip chain-of-thought tokens
  if (cfg.provider === "groq" && cfg.model.includes("qwen")) {
    body.reasoning_effort = "none";
  }

  const raw = await rawPost(url, { Authorization: `Bearer ${cfg.apiKey}` }, body);
  const json = JSON.parse(raw) as {
    choices?: Array<{ message: { content: string } }>;
    error?: { message: string };
  };

  if (json.error) throw new Error(`LLM error (${cfg.provider}): ${json.error.message}`);

  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/** Anthropic Messages API (different format from OpenAI). */
async function callAnthropic(
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
  cfg: WalkthroughConfig
): Promise<string> {
  const raw = await rawPost(
    "https://api.anthropic.com/v1/messages",
    {
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    {
      model: cfg.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }
  );

  const json = JSON.parse(raw) as {
    content?: Array<{ text: string }>;
    error?: { message: string };
  };

  if (json.error) throw new Error(`Anthropic error: ${json.error.message}`);

  return json.content?.[0]?.text?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Sarvam language codes
// ---------------------------------------------------------------------------

const SARVAM_LANG_CODES: Record<string, string> = {
  en: "en-IN", hi: "hi-IN", kn: "kn-IN", te: "te-IN",
};

// priya is en-IN only; priya works across all Indian languages in bulbul:v3
const SARVAM_SPEAKERS: Record<string, string> = {
  en: "priya", hi: "priya", kn: "priya", te: "priya",
};

// ---------------------------------------------------------------------------
// Translation via Sarvam
// ---------------------------------------------------------------------------

export function translateText(text: string, targetLang: string, sarvamApiKey: string): Promise<string> {
  if (targetLang === "en") return Promise.resolve(text);
  const key = sarvamApiKey || process.env.SARVAM_API_KEY || "";
  const targetCode = SARVAM_LANG_CODES[targetLang] ?? targetLang;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      input: text,
      source_language_code: "en-IN",
      target_language_code: targetCode,
      speaker_gender: "Female",
      mode: "formal",
      model: "mayura:v1",
      enable_preprocessing: false,
    });

    const req = https.request(
      {
        hostname: "api.sarvam.ai",
        path: "/translate",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "api-subscription-key": key,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json: Record<string, unknown>;
          try { json = JSON.parse(raw); }
          catch {
            reject(new Error(`Sarvam translate non-JSON (HTTP ${res.statusCode}): ${raw.slice(0, 200)}`));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Sarvam translate HTTP ${res.statusCode}: ${JSON.stringify(json)}`));
            return;
          }
          resolve((json.translated_text as string | undefined) ?? text);
        });
        res.on("error", reject);
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Narration
// ---------------------------------------------------------------------------

/** Strip markdown symbols the model sneaks in — output goes to TTS. */
function sanitise(text: string): string {
  return text
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
    .replace(/#+\s*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function fetchNarration(
  label: string,
  code: string,
  fileContext?: string,
  language = "en",
  crossFileContext?: CrossFileContext[]
): Promise<string> {
  const userContent = fileContext
    ? `Context: ${fileContext}\n\nBlock: ${label}\n\n${code}`
    : `Block: ${label}\n\n${code}`;

  let systemPrompt = SYSTEM_PROMPT;
  if (crossFileContext && crossFileContext.length > 0) {
    const crossInfo = crossFileContext
      .map(c => `- ${c.filePath} → ${c.blockLabel}: ${c.snippet}`)
      .join("\n");
    systemPrompt =
      SYSTEM_PROMPT +
      `\n\nThis block is also referenced or used in other parts of the codebase:\n${crossInfo}\n` +
      `Weave 1-2 sentences naturally into your narration explaining how this block connects to those files. ` +
      `Do not list them mechanically — integrate it as: "This is consumed by X to do Y" or "session.ts relies on this to orchestrate Z". ` +
      `Keep total narration 70-90 words.`;
  }

  const raw = await callLLM(systemPrompt, userContent, 220);
  const clean = sanitise(raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim());
  const narration = clean || label;

  if (language === "en") return narration;

  const cfg = getConfig();
  try {
    const translated = await translateText(narration, language, cfg.sarvamApiKey);
    return translated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[translate → ${language}] FAILED (${msg}) — using English`);
    return narration;
  }
}

// ---------------------------------------------------------------------------
// Cross-file context via Qdrant (used to enrich narration + flowchart popups)
// ---------------------------------------------------------------------------

interface QdrantSearchHit {
  score: number;
  payload: { code?: string; label?: string; file?: string };
}

/** Fetch top semantically related blocks from OTHER files for narration enrichment. */
export async function fetchCrossFileContext(
  blockLabel: string,
  blockCode: string,
  currentFilePath: string,
  cfg: WalkthroughConfig,
  topK = 3
): Promise<CrossFileContext[]> {
  try {
    const text = `${blockLabel} ${blockCode.slice(0, 300)}`;
    const vectors = await embed([text], cfg);
    const qVector = vectors[0];

    const searchRes = await makeQdrantRequest(
      "POST",
      "/collections/code_blocks/points/search",
      {
        vector: qVector,
        limit: topK + 2,
        with_payload: true,
        with_vector: false,
        score_threshold: 0.15,
      }
    ) as { result?: QdrantSearchHit[] };

    const hits = (searchRes.result ?? []).filter(
      h => (h.payload.file ?? "") !== currentFilePath
    );

    if (hits.length === 0) return [];

    return hits.slice(0, topK).map(h => ({
      filePath:   h.payload.file    ?? "",
      blockLabel: h.payload.label   ?? "",
      snippet:    (h.payload.code   ?? "").slice(0, 120),
    }));
  } catch {
    // Qdrant unavailable or empty — return plain [] silently
    return [];
  }
}

/** Fetch cross-file context for a flowchart node ID (cleaned label). */
export async function fetchNodeCrossFileContext(
  nodeLabel: string,
  currentFilePath: string,
  cfg: WalkthroughConfig
): Promise<CrossFileContext[]> {
  try {
    const cleaned = nodeLabel
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .toLowerCase()
      .trim();

    const vectors = await embed([cleaned], cfg);
    const qVector = vectors[0];

    const searchRes = await makeQdrantRequest(
      "POST",
      "/collections/code_blocks/points/search",
      {
        vector: qVector,
        limit: 5,
        with_payload: true,
        with_vector: false,
        score_threshold: 0.15,
      }
    ) as { result?: QdrantSearchHit[] };

    const hits = (searchRes.result ?? []).filter(
      h => (h.payload.file ?? "") !== currentFilePath
    );

    if (hits.length === 0) return [];

    return hits.slice(0, 3).map(h => ({
      filePath:   h.payload.file    ?? "",
      blockLabel: h.payload.label   ?? "",
      snippet:    (h.payload.code   ?? "").slice(0, 120),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Sarvam TTS → WAV Buffer
// ---------------------------------------------------------------------------

const SARVAM_MAX_CHARS = 490;

function truncateForTTS(text: string): string {
  if (text.length <= SARVAM_MAX_CHARS) return text;
  const cut = text.lastIndexOf(' ', SARVAM_MAX_CHARS);
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, SARVAM_MAX_CHARS)) + '…';
}

export function generateAudio(text: string, language = "en"): Promise<Buffer> {
  const cfg = getConfig();
  const key = cfg.sarvamApiKey || process.env.SARVAM_API_KEY || "";
  const ttsText = truncateForTTS(text);
  const targetLangCode = SARVAM_LANG_CODES[language] ?? "en-IN";
  const speaker = SARVAM_SPEAKERS[language] ?? "priya";

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      inputs: [ttsText],
      target_language_code: targetLangCode,
      speaker,
      model: "bulbul:v3",
      enable_preprocessing: true,
    });

    const req = https.request(
      {
        hostname: "api.sarvam.ai",
        path: "/text-to-speech",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": key,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json: Record<string, unknown>;
          try { json = JSON.parse(raw); }
          catch {
            reject(new Error(`Sarvam non-JSON (HTTP ${res.statusCode}): ${raw.slice(0, 300)}`));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Sarvam HTTP ${res.statusCode}: ${JSON.stringify(json)}`));
            return;
          }
          const b64 = (json.audios as string[] | undefined)?.[0];
          if (!b64) {
            reject(new Error(`Sarvam: missing audios[0]. Response: ${JSON.stringify(json)}`));
            return;
          }
          resolve(Buffer.from(b64, "base64"));
        });
        res.on("error", reject);
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Qdrant Q&A
// ---------------------------------------------------------------------------

interface QdrantPoint {
  id: number | string;
  payload: { code?: string; label?: string; file?: string };
}

function makeQdrantRequest(method: string, urlPath: string, body?: object): Promise<unknown> {
  const baseUrl = (process.env.QDRANT_URL ?? "http://localhost:6333").replace(/\/$/, "");
  const apiKey = process.env.QDRANT_API_KEY;
  const fullUrl = new URL(urlPath, baseUrl + "/");
  const isHttps = fullUrl.protocol === "https:";

  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : "";
    const headers: Record<string, string | number> = { "Content-Type": "application/json" };
    if (bodyStr) headers["Content-Length"] = Buffer.byteLength(bodyStr);
    if (apiKey) headers["api-key"] = apiKey;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport: any = isHttps ? https : http;

    const req = transport.request(
      {
        hostname: fullUrl.hostname,
        port: fullUrl.port ? Number(fullUrl.port) : isHttps ? 443 : 6333,
        path: fullUrl.pathname + (fullUrl.search || ""),
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
          catch { reject(new Error(`Qdrant non-JSON (HTTP ${res.statusCode}): ${text.slice(0, 200)}`)); }
        });
        res.on("error", reject);
      }
    );

    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

export async function queryCodebase(
  question: string,
  onProgress?: (msg: string) => void,
  language = "en"
): Promise<{ answer: string; topLabel: string; topFile: string }> {
  const cfg = getConfig();

  // ── 1. Embed the question ─────────────────────────────────────────────────
  onProgress?.("Analysing your question...");
  const vectors = await embed([question], cfg);
  const qVector = vectors[0];

  // ── 2. Vector search in Qdrant ────────────────────────────────────────────
  onProgress?.("Searching the codebase index...");
  const searchRes = await makeQdrantRequest("POST", "/collections/code_blocks/points/search", {
    vector: qVector,
    limit: 10,
    with_payload: true,
    with_vector: false,
    score_threshold: 0.10,
  }) as { result?: Array<{ score: number; payload: QdrantPoint["payload"] }> };

  const hits = searchRes.result ?? [];
  console.log(`[Q&A] Retrieved ${hits.length} blocks:`,
    hits.map(h => `${h.score.toFixed(3)} — ${h.payload.label} (${h.payload.file})`).join(", "));

  if (hits.length === 0) {
    throw new Error(
      "No relevant code found. The codebase may not be indexed yet — " +
      "restart the walkthrough to trigger indexing."
    );
  }

  // Show which files were pulled — deduplicated basenames in found order
  const uniqueFiles = [...new Set(
    hits.map(h => (h.payload.file ?? "").split(/[\\/]/).pop() ?? h.payload.file ?? "?")
  )];
  const fileList = uniqueFiles.slice(0, 5).join("  ·  ");
  onProgress?.(`Fetched ${hits.length} blocks from: ${fileList}  —  feeding to AI...`);

  // ── 3. Build ranked context for the LLM ──────────────────────────────────
  const context = hits
    .map((h, i) => {
      const snippet = (h.payload.code ?? "").slice(0, 800);
      return `[${i}] ${h.payload.label ?? "?"} in ${h.payload.file ?? "?"} (score ${h.score.toFixed(3)}):\n${snippet}`;
    })
    .join("\n\n---\n\n");

  // ── 4. LLM answers with retrieved context (RAG) ───────────────────────────
  onProgress?.(`Asking AI with context from ${uniqueFiles.length} file${uniqueFiles.length !== 1 ? "s" : ""}...`);
  const systemPrompt =
    "You are a code Q&A assistant. Answer the question using the provided code context. " +
    "Look at imports, variable names, config values, and initialization code to infer the answer — " +
    "do not require an explicit label; infer from usage patterns. " +
    "Identify the single most relevant block index (N). " +
    'Respond ONLY with valid JSON — no markdown: {"answer": "...", "topIndex": N}' +
    (language !== "en" ? ` Respond in ${language}.` : "");

  const raw = await callLLM(systemPrompt, `Context:\n${context}\n\nQuestion: ${question}`, 400);
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  let parsed: { answer?: string; topIndex?: number } = {};
  if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch { /* fall through */ } }

  const topIdx = typeof parsed.topIndex === "number"
    ? Math.min(Math.max(0, parsed.topIndex), hits.length - 1) : 0;

  return {
    answer: parsed.answer ?? clean,
    topLabel: hits[topIdx]?.payload?.label ?? "",
    topFile: hits[topIdx]?.payload?.file ?? "",
  };
}

// ---------------------------------------------------------------------------
// Deep Dive
// ---------------------------------------------------------------------------

export async function fetchDeepDiveNarrations(block: SemanticBlock, language = "en"): Promise<string[]> {
  const lineCount = block.code.split("\n").length;
  const targetChunks = Math.min(lineCount, 8);

  const systemPrompt =
    "You are a senior developer doing a live pair-programming session, walking a junior colleague through code. " +
    "For each chunk, explain it like you're thinking out loud — casual, direct, relatable. " +
    "Mention WHY it's written that way, any gotchas, or analogies that make it click. " +
    `Produce exactly ${targetChunks} explanations. ` +
    "Return ONLY a valid JSON array of strings — no markdown fences, no preamble. " +
    "Each string: 1-2 casual sentences spoken aloud. " +
    PLAIN_SPEECH_RULE;

  const raw = await callLLM(systemPrompt, `Block: ${block.label}\n\n${block.code}`, 800);
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (!arrMatch) throw new Error(`Deep dive: expected JSON array, got: ${clean.slice(0, 200)}`);

  const parsed: unknown = JSON.parse(arrMatch[0]);
  if (!Array.isArray(parsed)) throw new Error("Deep dive: response is not an array");

  const narrations = (parsed as unknown[])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map(sanitise)
    .filter(s => s.length > 0);

  if (language === "en") return narrations;

  const cfg = getConfig();
  return Promise.all(
    narrations.map(async (n) => {
      try { return await translateText(n, language, cfg.sarvamApiKey); }
      catch (err) {
        console.warn(`[translate → ${language}] deep-dive chunk failed: ${err instanceof Error ? err.message : err}`);
        return n;
      }
    })
  );
}
