"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.setActiveConfig = setActiveConfig;
exports.callLLM = callLLM;
exports.fetchNarration = fetchNarration;
exports.generateAudio = generateAudio;
exports.queryCodebase = queryCodebase;
exports.fetchDeepDiveNarrations = fetchDeepDiveNarrations;
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const embedder_1 = require("./embedder");
// ---------------------------------------------------------------------------
// .env fallback (developer use only — overridden by SecretStorage in production)
// ---------------------------------------------------------------------------
(function loadEnv() {
    const envFile = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(envFile))
        return;
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
        const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]])
            process.env[m[1]] = m[2].trim();
    }
})();
// ---------------------------------------------------------------------------
// Active config (set by extension.ts before each session)
// ---------------------------------------------------------------------------
let activeConfig = null;
/** Called by extension.ts after loading config from SecretStorage. */
function setActiveConfig(cfg) {
    activeConfig = cfg;
}
function getConfig() {
    if (activeConfig)
        return activeConfig;
    // Dev fallback: assume Groq with .env keys
    return {
        provider: "groq",
        model: process.env.GROQ_MODEL ?? "qwen/qwen3-32b",
        apiKey: process.env.GROQ_API_KEY ?? "",
        sarvamApiKey: process.env.SARVAM_API_KEY ?? "",
        customBaseUrl: "",
        embeddingProvider: "jina",
        embeddingApiKey: process.env.JINA_API_KEY ?? process.env.EMBEDDING_API_KEY ?? "",
    };
}
// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
const PLAIN_SPEECH_RULE = "IMPORTANT: Write in plain spoken English only. " +
    "Do NOT use backticks, underscores, asterisks, hash signs, angle brackets, or any markdown. " +
    "Do NOT write variable/function names in code style — say them as plain words. " +
    "This text is read aloud by a TTS voice so write exactly as you would speak.";
const SYSTEM_PROMPT = "You are a friendly senior developer giving a live code tour to a new teammate. " +
    "Talk like you're explaining over coffee — casual, warm, genuinely helpful. " +
    "In 2-3 sentences: what the block DOES, WHY it exists, how it fits the bigger picture. " +
    "Use simple analogies for complex concepts. Skip jargon. " +
    "Never just restate the code — tell the person what they actually need to understand. " +
    PLAIN_SPEECH_RULE;
// ---------------------------------------------------------------------------
// Raw HTTP helper
// ---------------------------------------------------------------------------
function rawPost(url, headers, body) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(body);
        let parsed;
        try {
            parsed = new URL(url);
        }
        catch {
            reject(new Error(`Invalid URL: ${url}`));
            return;
        }
        const isHttps = parsed.protocol === "https:";
        const port = parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transport = isHttps ? https : http;
        const req = transport.request({
            hostname: parsed.hostname,
            port,
            path: parsed.pathname + (parsed.search ?? ""),
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bodyStr),
                ...headers,
            },
        }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
            res.on("error", reject);
        });
        req.on("error", reject);
        req.write(bodyStr);
        req.end();
    });
}
async function callLLM(systemPrompt, userContent, maxTokens) {
    const cfg = getConfig();
    if (cfg.provider === "anthropic") {
        return callAnthropic(systemPrompt, userContent, maxTokens, cfg);
    }
    return callOpenAICompat(systemPrompt, userContent, maxTokens, cfg);
}
/** OpenAI-compatible call — works for Groq, OpenAI, and Custom. */
async function callOpenAICompat(systemPrompt, userContent, maxTokens, cfg) {
    const base = {
        groq: "https://api.groq.com/openai/v1",
        openai: "https://api.openai.com/v1",
        custom: cfg.customBaseUrl.replace(/\/$/, "") || "https://api.openai.com/v1",
    };
    const url = `${base[cfg.provider] ?? base.groq}/chat/completions`;
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = { model: cfg.model, max_tokens: maxTokens, messages };
    // Groq qwen3 supports reasoning_effort to skip chain-of-thought tokens
    if (cfg.provider === "groq" && cfg.model.includes("qwen")) {
        body.reasoning_effort = "none";
    }
    const raw = await rawPost(url, { Authorization: `Bearer ${cfg.apiKey}` }, body);
    const json = JSON.parse(raw);
    if (json.error)
        throw new Error(`LLM error (${cfg.provider}): ${json.error.message}`);
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
/** Anthropic Messages API (different format from OpenAI). */
async function callAnthropic(systemPrompt, userContent, maxTokens, cfg) {
    const raw = await rawPost("https://api.anthropic.com/v1/messages", {
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
    }, {
        model: cfg.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
    });
    const json = JSON.parse(raw);
    if (json.error)
        throw new Error(`Anthropic error: ${json.error.message}`);
    return json.content?.[0]?.text?.trim() ?? "";
}
// ---------------------------------------------------------------------------
// Narration
// ---------------------------------------------------------------------------
/** Strip markdown symbols the model sneaks in — output goes to TTS. */
function sanitise(text) {
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
async function fetchNarration(label, code, fileContext) {
    const userContent = fileContext
        ? `Context: ${fileContext}\n\nBlock: ${label}\n\n${code}`
        : `Block: ${label}\n\n${code}`;
    const raw = await callLLM(SYSTEM_PROMPT, userContent, 200);
    const clean = sanitise(raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim());
    return clean || label;
}
// ---------------------------------------------------------------------------
// Sarvam TTS → WAV Buffer
// ---------------------------------------------------------------------------
function generateAudio(text) {
    const cfg = getConfig();
    const key = cfg.sarvamApiKey || process.env.SARVAM_API_KEY || "";
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            inputs: [text],
            target_language_code: "en-IN",
            speaker: "priya",
            model: "bulbul:v3",
            enable_preprocessing: true,
        });
        const req = https.request({
            hostname: "api.sarvam.ai",
            path: "/text-to-speech",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-subscription-key": key,
            },
        }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const raw = Buffer.concat(chunks).toString("utf8");
                let json;
                try {
                    json = JSON.parse(raw);
                }
                catch {
                    reject(new Error(`Sarvam non-JSON (HTTP ${res.statusCode}): ${raw.slice(0, 300)}`));
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`Sarvam HTTP ${res.statusCode}: ${JSON.stringify(json)}`));
                    return;
                }
                const b64 = json.audios?.[0];
                if (!b64) {
                    reject(new Error(`Sarvam: missing audios[0]. Response: ${JSON.stringify(json)}`));
                    return;
                }
                resolve(Buffer.from(b64, "base64"));
            });
            res.on("error", reject);
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}
function makeQdrantRequest(method, urlPath, body) {
    const baseUrl = (process.env.QDRANT_URL ?? "http://localhost:6333").replace(/\/$/, "");
    const apiKey = process.env.QDRANT_API_KEY;
    const fullUrl = new URL(urlPath, baseUrl + "/");
    const isHttps = fullUrl.protocol === "https:";
    return new Promise((resolve, reject) => {
        const bodyStr = body ? JSON.stringify(body) : "";
        const headers = { "Content-Type": "application/json" };
        if (bodyStr)
            headers["Content-Length"] = Buffer.byteLength(bodyStr);
        if (apiKey)
            headers["api-key"] = apiKey;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transport = isHttps ? https : http;
        const req = transport.request({
            hostname: fullUrl.hostname,
            port: fullUrl.port ? Number(fullUrl.port) : isHttps ? 443 : 6333,
            path: fullUrl.pathname + (fullUrl.search || ""),
            method,
            headers,
        }, 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                try {
                    resolve(JSON.parse(text));
                }
                catch {
                    reject(new Error(`Qdrant non-JSON (HTTP ${res.statusCode}): ${text.slice(0, 200)}`));
                }
            });
            res.on("error", reject);
        });
        req.on("error", reject);
        if (bodyStr)
            req.write(bodyStr);
        req.end();
    });
}
async function queryCodebase(question) {
    const cfg = getConfig();
    if (!cfg.embeddingApiKey) {
        throw new Error("Embedding API key not configured — open Walkthrough: Configure to add your Jina AI or OpenAI key.");
    }
    // ── 1. Embed the question (same model used to index the codebase) ──────────
    const vectors = await (0, embedder_1.embed)([question], cfg);
    const qVector = vectors[0];
    // ── 2. Vector search in Qdrant ────────────────────────────────────────────
    const searchRes = await makeQdrantRequest("POST", "/collections/code_blocks/points/search", {
        vector: qVector,
        limit: 5,
        with_payload: true,
        with_vector: false,
        score_threshold: 0.25,
    });
    const hits = searchRes.result ?? [];
    if (hits.length === 0) {
        throw new Error("No relevant code found. The codebase may not be indexed yet — " +
            "restart the walkthrough to trigger indexing, or run Walkthrough: Index Codebase.");
    }
    // ── 3. Build ranked context for the LLM ──────────────────────────────────
    const context = hits
        .map((h, i) => {
        const snippet = (h.payload.code ?? "").slice(0, 300).replace(/\n/g, " ");
        return `[${i}] ${h.payload.label ?? "?"} in ${h.payload.file ?? "?"} (${(h.score * 100).toFixed(0)}% relevant):\n  ${snippet}`;
    })
        .join("\n\n");
    // ── 4. LLM answers with retrieved context (RAG) ───────────────────────────
    const systemPrompt = "You are a code Q&A assistant. Using ONLY the provided code context, answer the question precisely. " +
        "Identify the single most relevant block index (N). " +
        'Respond ONLY with valid JSON — no markdown: {"answer": "...", "topIndex": N}';
    const raw = await callLLM(systemPrompt, `Context:\n${context}\n\nQuestion: ${question}`, 400);
    const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    let parsed = {};
    if (jsonMatch) {
        try {
            parsed = JSON.parse(jsonMatch[0]);
        }
        catch { /* fall through */ }
    }
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
async function fetchDeepDiveNarrations(block) {
    const lineCount = block.code.split("\n").length;
    const targetChunks = Math.min(lineCount, 8);
    const systemPrompt = "You are a senior developer doing a live pair-programming session, walking a junior colleague through code. " +
        "For each chunk, explain it like you're thinking out loud — casual, direct, relatable. " +
        "Mention WHY it's written that way, any gotchas, or analogies that make it click. " +
        `Produce exactly ${targetChunks} explanations. ` +
        "Return ONLY a valid JSON array of strings — no markdown fences, no preamble. " +
        "Each string: 1-2 casual sentences spoken aloud. " +
        PLAIN_SPEECH_RULE;
    const raw = await callLLM(systemPrompt, `Block: ${block.label}\n\n${block.code}`, 800);
    const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const arrMatch = clean.match(/\[[\s\S]*\]/);
    if (!arrMatch)
        throw new Error(`Deep dive: expected JSON array, got: ${clean.slice(0, 200)}`);
    const parsed = JSON.parse(arrMatch[0]);
    if (!Array.isArray(parsed))
        throw new Error("Deep dive: response is not an array");
    return parsed
        .filter((s) => typeof s === "string" && s.trim().length > 0)
        .map(sanitise)
        .filter(s => s.length > 0);
}
//# sourceMappingURL=narrate.js.map