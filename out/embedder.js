"use strict";
/**
 * embedder.ts — API-based embedding generation.
 *
 * Supported providers:
 *   jina   → https://api.jina.ai/v1/embeddings   (768 dims, code-specialized, free tier)
 *   openai → https://api.openai.com/v1/embeddings (1536 dims, general, reuses LLM key)
 *
 * No local models. Pure HTTP — same pattern as narrate.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VECTOR_SIZES = void 0;
exports.embed = embed;
const https = require("https");
// ── Vector sizes ──────────────────────────────────────────────────────────────
exports.VECTOR_SIZES = {
    jina: 768,
    openai: 1536,
};
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Embed a batch of texts.  Returns one float32 vector per input.
 * Batches are processed in one API call (both Jina and OpenAI support multi-input).
 */
async function embed(texts, cfg) {
    if (!texts.length)
        return [];
    const provider = cfg.embeddingProvider ?? "jina";
    const key = cfg.embeddingApiKey ?? "";
    if (!key)
        throw new Error(`Embedding API key not set — open Walkthrough: Configure to add your ${provider === "jina" ? "Jina AI" : "OpenAI"} key.`);
    if (provider === "openai")
        return embedOpenAI(texts, key);
    return embedJina(texts, key);
}
// ── Jina AI ───────────────────────────────────────────────────────────────────
async function embedJina(texts, apiKey) {
    const raw = await httpPost("https://api.jina.ai/v1/embeddings", { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, { model: "jina-embeddings-v2-base-code", input: texts });
    const json = JSON.parse(raw);
    const errMsg = json.detail ?? json.message;
    if (errMsg || !json.data)
        throw new Error(`Jina AI embedding error: ${errMsg ?? "no data returned"}`);
    // Sort by index (Jina guarantees order but let's be safe)
    return [...json.data]
        .sort((a, b) => a.index - b.index)
        .map(d => d.embedding);
}
// ── OpenAI ────────────────────────────────────────────────────────────────────
async function embedOpenAI(texts, apiKey) {
    const raw = await httpPost("https://api.openai.com/v1/embeddings", { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, { model: "text-embedding-3-small", input: texts });
    const json = JSON.parse(raw);
    if (json.error)
        throw new Error(`OpenAI embedding error: ${json.error.message}`);
    if (!json.data)
        throw new Error("OpenAI: no embedding data returned");
    return [...json.data]
        .sort((a, b) => a.index - b.index)
        .map(d => d.embedding);
}
// ── Raw HTTP helper ───────────────────────────────────────────────────────────
function httpPost(url, headers, body) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(body);
        const req = https.request({
            hostname: new URL(url).hostname,
            path: new URL(url).pathname,
            method: "POST",
            headers: { ...headers, "Content-Length": Buffer.byteLength(bodyStr) },
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
//# sourceMappingURL=embedder.js.map